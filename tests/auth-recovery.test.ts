import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  requestPasswordReset,
  verifyResetToken,
  completePasswordReset,
  pruneResetTokens,
} from '@/lib/password-reset';
import { rateLimit, clearRateLimit, pruneRateLimits, LIMITS } from '@/lib/rate-limit';

/**
 * Password recovery and rate limiting, against the real database.
 *
 * This flow can hand over an account, so the tests are about what must *not*
 * happen: a link that works twice, a link that outlives its replacement, a
 * token readable from a database dump, and a throttle that can be walked past.
 */

const TAG = `authtest-${Date.now()}`;
const EMAIL = `${TAG}@test.local`;
const OLD_PASSWORD = 'OldPassword@123';

let userId: string;
beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
      role: 'TRAINER',
    },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.emailLog.deleteMany({ where: { to: { contains: TAG } } });
  await prisma.rateLimitHit.deleteMany({ where: { subject: { contains: TAG } } });
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } });
});

beforeEach(async () => {
  await prisma.rateLimitHit.deleteMany({ where: { subject: { contains: TAG } } });
});

describe('the stored token', () => {
  it('is a hash, not the token itself', async () => {
    await requestPasswordReset({ email: EMAIL });
    const row = await prisma.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { tokenHash: true },
    });

    // sha256 hex: a database dump must not contain anything usable as a link.
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('burns the previous outstanding token when a new one is issued', async () => {
    await requestPasswordReset({ email: EMAIL });
    await requestPasswordReset({ email: EMAIL });

    const live = await prisma.passwordResetToken.count({
      where: { userId, usedAt: null },
    });
    // Exactly one live link at a time — an older mail must not be a way back in.
    expect(live).toBe(1);
  });

  it('says nothing about whether an address is registered', async () => {
    // Both calls resolve identically; the caller cannot tell them apart, which
    // is what stops this form being a customer-list oracle.
    await expect(requestPasswordReset({ email: 'nobody@nowhere.invalid' })).resolves.toBeUndefined();
    await expect(requestPasswordReset({ email: EMAIL })).resolves.toBeUndefined();
  });

  it('issues nothing for a suspended account', async () => {
    await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });

    await requestPasswordReset({ email: EMAIL });
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(0);

    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  });
});

describe('verifying a token', () => {
  it('rejects nonsense without touching the database', async () => {
    expect(await verifyResetToken('')).toEqual({ ok: false, reason: 'INVALID' });
    expect(await verifyResetToken('short')).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('rejects a token nobody issued', async () => {
    expect(await verifyResetToken('a'.repeat(43))).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('rejects an expired token', async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256')
          .update('expired-token-for-this-test-0000000000')
          .digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    expect(await verifyResetToken('expired-token-for-this-test-0000000000')).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
  });
});

describe('spending a token', () => {
  const NEW_PASSWORD = 'BrandNewPassword@456';
  const token = 'plain-token-used-by-the-spend-tests-000';

  async function seedToken(expiresInMs = 60 * 60 * 1000) {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + expiresInMs),
      },
    });
  }

  it('sets the password and marks the token used', async () => {
    await seedToken();
    expect(await completePasswordReset({ token, password: NEW_PASSWORD })).toEqual({ ok: true });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    expect(await bcrypt.compare(NEW_PASSWORD, user!.passwordHash)).toBe(true);
    expect(await bcrypt.compare(OLD_PASSWORD, user!.passwordHash)).toBe(false);
  });

  it('refuses to work twice', async () => {
    await seedToken();
    expect(await completePasswordReset({ token, password: NEW_PASSWORD })).toEqual({ ok: true });
    expect(await completePasswordReset({ token, password: 'AnotherPassword@789' })).toEqual({
      ok: false,
      reason: 'USED',
    });
  });

  it('survives two simultaneous submissions without both succeeding', async () => {
    await seedToken();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        completePasswordReset({ token, password: NEW_PASSWORD }).catch(() => ({
          ok: false as const,
          reason: 'USED' as const,
        })),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('refuses a password shorter than the minimum', async () => {
    await seedToken();
    expect(await completePasswordReset({ token, password: 'short' })).toEqual({
      ok: false,
      reason: 'WEAK',
    });
    // And leaves the token unspent, so the visitor can try again.
    expect(await verifyResetToken(token)).toEqual({ ok: true });
  });

  it('refuses an expired token even with a good password', async () => {
    await seedToken(-1000);
    expect(await completePasswordReset({ token, password: NEW_PASSWORD })).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
  });
});

describe('rate limiting', () => {
  const subject = `${TAG}-subject`;

  it('allows up to the limit and refuses past it', async () => {
    const max = LIMITS.login.max;

    for (let i = 1; i <= max; i += 1) {
      const result = await rateLimit('login', subject);
      expect(result.allowed, `attempt ${i} of ${max} should be allowed`).toBe(true);
    }

    const overflow = await rateLimit('login', subject);
    expect(overflow.allowed).toBe(false);
    expect(overflow.retryAt).toBeInstanceOf(Date);
  });

  it('counts each subject separately', async () => {
    for (let i = 0; i <= LIMITS.login.max; i += 1) await rateLimit('login', `${subject}-a`);
    expect((await rateLimit('login', `${subject}-a`)).allowed).toBe(false);
    // A different person on a different address is unaffected.
    expect((await rateLimit('login', `${subject}-b`)).allowed).toBe(true);
  });

  it('counts each bucket separately', async () => {
    for (let i = 0; i <= LIMITS.login.max; i += 1) await rateLimit('login', subject);
    expect((await rateLimit('login', subject)).allowed).toBe(false);
    // Being throttled at sign-in must not also block asking for a reset link,
    // which is exactly what a locked-out person needs to do next.
    expect((await rateLimit('passwordReset', subject)).allowed).toBe(true);
  });

  it('clears on success, so a fumbled password does not lock someone out', async () => {
    for (let i = 0; i < LIMITS.login.max; i += 1) await rateLimit('login', subject);
    await clearRateLimit('login', subject);
    expect((await rateLimit('login', subject)).allowed).toBe(true);
  });

  it('is case-insensitive, since the subject carries an email', async () => {
    await rateLimit('login', `${TAG}-CaseTest`);
    const hits = await prisma.rateLimitHit.count({
      where: { bucket: 'login', subject: `${TAG}-casetest`.toLowerCase() },
    });
    expect(hits).toBe(1);
  });

  it('can peek without recording', async () => {
    const before = await prisma.rateLimitHit.count({ where: { subject: `${TAG}-peek` } });
    await rateLimit('login', `${TAG}-peek`, { record: false });
    const after = await prisma.rateLimitHit.count({ where: { subject: `${TAG}-peek` } });
    expect(after).toBe(before);
  });
});

describe('housekeeping', () => {
  it('prunes without throwing', async () => {
    await expect(pruneRateLimits()).resolves.toBeTypeOf('number');
    await expect(pruneResetTokens()).resolves.toBeTypeOf('number');
  });
});

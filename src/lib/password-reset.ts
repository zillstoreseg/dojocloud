import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from './prisma';
import { hashPassword } from './password';
import { emailUser, absoluteUrl } from './email';
import { audit } from './audit';

/**
 * Losing a password, and getting back in.
 *
 * Without this the platform has no recovery path at all: a coach who forgets
 * their password is locked out of their own business, their trainees, and
 * their wallet, and the only fix is somebody editing the database by hand.
 *
 * Three properties matter here more than anywhere else in the product, because
 * this flow can hand over an account:
 *
 *   1. Only the hash is stored. The token exists in one place — the email — so
 *      a database dump is not a set of working keys to every account.
 *   2. Requesting a reset never reveals whether an address is registered.
 *      Otherwise the form becomes a way to enumerate the platform's customers.
 *   3. Using a token invalidates every other outstanding one for that user, and
 *      itself. A reset link that still works after the password changed is a
 *      backdoor left by whoever asked for it first.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a reset link and emails it.
 *
 * Returns nothing about whether the address exists — the caller shows the same
 * message either way.
 */
export async function requestPasswordReset(input: {
  email: string;
  ip?: string;
  locale?: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true },
  });

  // A suspended account gets no link: the reset would succeed and they still
  // could not sign in, which is a confusing way to say "you are suspended".
  if (!user || user.status === 'SUSPENDED') return;

  const token = randomBytes(32).toString('base64url');

  // Outstanding links are burned when a new one is issued. Someone who clicks
  // "send again" expects the newest mail to be the one that works, and leaving
  // the older links live widens the window for no benefit.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      requestIp: input.ip ?? null,
    },
  });

  const link = absoluteUrl(`/${input.locale ?? 'ar'}/reset?token=${token}`);

  await emailUser({
    userId: user.id,
    template: 'password-reset',
    subject: { ar: 'استعادة كلمة السر', en: 'Reset your password' },
    content: {
      ar: {
        preheader: 'الرابط صالح لمدة ساعة واحدة.',
        heading: 'استعادة كلمة السر',
        body: [
          'وصلنا طلب لتغيير كلمة السر بتاعت حسابك. اضغط الزر تحت وحدّدها من جديد.',
          'الرابط ده صالح لمدة ساعة واحدة، ولمرة واحدة بس.',
        ],
        cta: { label: 'حدّد كلمة سر جديدة', href: link },
        footnote: 'لو مش إنت اللي طلبت ده، تجاهل الرسالة — حسابك زي ما هو ومحدش يقدر يدخله.',
      },
      en: {
        preheader: 'This link is valid for one hour.',
        heading: 'Reset your password',
        body: [
          'We received a request to change your password. Use the button below to set a new one.',
          'The link is valid for one hour, and works once.',
        ],
        cta: { label: 'Set a new password', href: link },
        footnote: 'If this was not you, ignore this email — your account is unchanged.',
      },
    },
  });

  await audit({
    actorId: user.id,
    action: 'password.reset_requested',
    entity: 'User',
    entityId: user.id,
  });
}

export type ResetOutcome =
  | { ok: true }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'USED' | 'WEAK' };

/**
 * Checks a token without spending it, so the reset form can refuse to render
 * for a dead link rather than collecting a password and then rejecting it.
 */
export async function verifyResetToken(token: string): Promise<ResetOutcome> {
  if (!token || token.length < 20) return { ok: false, reason: 'INVALID' };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, usedAt: true, tokenHash: true },
  });

  if (!row) return { ok: false, reason: 'INVALID' };

  // Constant-time even though the lookup was by hash: the comparison costs
  // nothing and removes any doubt about this path leaking timing.
  const provided = Buffer.from(hashToken(token));
  const stored = Buffer.from(row.tokenHash);
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
    return { ok: false, reason: 'INVALID' };
  }

  if (row.usedAt) return { ok: false, reason: 'USED' };
  if (row.expiresAt < new Date()) return { ok: false, reason: 'EXPIRED' };

  return { ok: true };
}

/** Minimum the register form already demands; kept in step with it. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Spends a token and sets the new password.
 *
 * The token is marked used inside the same transaction that writes the hash,
 * and every other outstanding token for the user is burned with it — so a
 * second reset link mailed an hour earlier cannot be used to take the account
 * back afterwards.
 */
export async function completePasswordReset(input: {
  token: string;
  password: string;
}): Promise<ResetOutcome> {
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'WEAK' };

  const verified = await verifyResetToken(input.token);
  if (!verified.ok) return verified;

  const tokenHash = hashToken(input.token);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true },
  });
  if (!row) return { ok: false, reason: 'INVALID' };

  const passwordHash = await hashPassword(input.password);

  const spent = await prisma.$transaction(async (tx) => {
    // Claim the token conditionally: two submissions of the same form must not
    // both succeed, and only the first should be able to set a password.
    const claim = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) return false;

    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    return true;
  });

  if (!spent) return { ok: false, reason: 'USED' };

  await audit({
    actorId: row.userId,
    action: 'password.reset_completed',
    entity: 'User',
    entityId: row.userId,
  });

  return { ok: true };
}

/** Drops spent and expired tokens. Called from the daily cron. */
export async function pruneResetTokens(): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 7 * 864e5) } },
        { usedAt: { lt: new Date(Date.now() - 7 * 864e5) } },
      ],
    },
  });
  return result.count;
}

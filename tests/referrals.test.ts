import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  generateReferralCode,
  ensureReferralCode,
  resolveReferralCode,
  grantReferralReward,
} from '@/lib/referrals';

/**
 * Referrals against the real database.
 *
 * The reward moves money — a free month is revenue the platform chose not to
 * collect — so the properties that matter are the ones that stop it being paid
 * twice, and the ones that stop it shortening a subscription it was meant to
 * extend.
 */

const TAG = `reftest-${Date.now()}`;

async function makeCoach(name: string, endsInDays: number | null) {
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${name}@test.local`,
      passwordHash: await bcrypt.hash('x'.repeat(12), 4),
      role: 'TRAINER',
    },
    select: { id: true },
  });

  const profile = await prisma.trainerProfile.create({
    data: {
      userId: user.id,
      username: `${TAG}-${name}`,
      fullName: `${TAG} ${name}`,
      phone: '0100000000',
      country: 'EG',
      gender: 'MALE',
      trainsGenders: 'BOTH',
      yearsExperience: 3,
      approvalStatus: 'APPROVED',
    },
    select: { id: true, userId: true },
  });

  if (endsInDays !== null) {
    const plan = await prisma.plan.findFirst({ select: { id: true } });
    await prisma.subscription.create({
      data: {
        trainerId: profile.id,
        planId: plan!.id,
        status: 'ACTIVE',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + endsInDays * 864e5),
        currency: 'EGP',
        amount: 0,
      },
    });
  }

  return profile;
}

let settingBackup: { enabled: string; days: string };

beforeAll(async () => {
  const [enabled, days] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: 'referral.enabled' } }),
    prisma.appSetting.findUnique({ where: { key: 'referral.reward_days' } }),
  ]);
  settingBackup = { enabled: enabled?.value ?? '', days: days?.value ?? '' };

  await prisma.appSetting.upsert({
    where: { key: 'referral.enabled' },
    create: { key: 'referral.enabled', value: 'true', category: 'referral' },
    update: { value: 'true' },
  });
  await prisma.appSetting.upsert({
    where: { key: 'referral.reward_days' },
    create: { key: 'referral.reward_days', value: '30', category: 'referral' },
    update: { value: '30' },
  });
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { trainer: { username: { startsWith: TAG } } } });
  await prisma.trainerProfile.updateMany({
    where: { username: { startsWith: TAG } },
    data: { referredById: null },
  });
  await prisma.trainerProfile.deleteMany({ where: { username: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });

  if (settingBackup.enabled) {
    await prisma.appSetting.update({
      where: { key: 'referral.enabled' },
      data: { value: settingBackup.enabled },
    });
  }
  if (settingBackup.days) {
    await prisma.appSetting.update({
      where: { key: 'referral.reward_days' },
      data: { value: settingBackup.days },
    });
  }
});

describe('generateReferralCode', () => {
  it('is seven characters from an unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateReferralCode();
      expect(code).toHaveLength(7);
      // No 0/O/1/I: a code gets read aloud and typed by hand.
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/);
    }
  });

  it('does not repeat itself in a small sample', () => {
    const codes = new Set(Array.from({ length: 500 }, generateReferralCode));
    expect(codes.size).toBe(500);
  });
});

describe('ensureReferralCode', () => {
  it('allocates once and returns the same code afterwards', async () => {
    const coach = await makeCoach('stable', 30);
    const first = await ensureReferralCode(coach.id);
    const second = await ensureReferralCode(coach.id);
    expect(second).toBe(first);
  });

  it('resolves its own code back to the coach', async () => {
    const coach = await makeCoach('resolve', 30);
    const code = await ensureReferralCode(coach.id);
    expect(await resolveReferralCode(code)).toEqual({ id: coach.id });
  });

  it('resolves case-insensitively, because people type it by hand', async () => {
    const coach = await makeCoach('lower', 30);
    const code = await ensureReferralCode(coach.id);
    expect(await resolveReferralCode(code.toLowerCase())).toEqual({ id: coach.id });
  });

  it('returns null for a code nobody owns', async () => {
    expect(await resolveReferralCode('ZZZZZZZ')).toBeNull();
    expect(await resolveReferralCode('')).toBeNull();
  });
});

describe('grantReferralReward', () => {
  it('extends both sides from their existing end date, not from today', async () => {
    const referrer = await makeCoach('r1', 10);
    const referred = await makeCoach('r1b', 20);
    await prisma.trainerProfile.update({
      where: { id: referred.id },
      data: { referredById: referrer.id },
    });

    const before = await Promise.all(
      [referrer.id, referred.id].map((id) =>
        prisma.subscription.findFirst({ where: { trainerId: id }, select: { endsAt: true } }),
      ),
    );

    const reward = await grantReferralReward(referred.id);
    expect(reward).not.toBeNull();
    expect(reward!.days).toBe(30);

    const after = await Promise.all(
      [referrer.id, referred.id].map((id) =>
        prisma.subscription.findFirst({ where: { trainerId: id }, select: { endsAt: true } }),
      ),
    );

    for (let i = 0; i < 2; i += 1) {
      const gained = after[i]!.endsAt!.getTime() - before[i]!.endsAt!.getTime();
      // 30 days, to the millisecond — the extension is from endsAt, so a coach
      // with time left never loses it.
      expect(Math.round(gained / 864e5)).toBe(30);
    }
  });

  it('pays once, however many times it is called', async () => {
    const referrer = await makeCoach('r2', 10);
    const referred = await makeCoach('r2b', 10);
    await prisma.trainerProfile.update({
      where: { id: referred.id },
      data: { referredById: referrer.id },
    });

    const first = await grantReferralReward(referred.id);
    const second = await grantReferralReward(referred.id);
    const third = await grantReferralReward(referred.id);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(third).toBeNull();

    const sub = await prisma.subscription.findFirst({
      where: { trainerId: referrer.id },
      select: { endsAt: true },
    });
    const gained = sub!.endsAt!.getTime() - Date.now();
    // 10 original + 30 reward, not 10 + 90.
    expect(Math.round(gained / 864e5)).toBe(40);
  });

  it('survives concurrent approvals without double-paying', async () => {
    const referrer = await makeCoach('r3', 10);
    const referred = await makeCoach('r3b', 10);
    await prisma.trainerProfile.update({
      where: { id: referred.id },
      data: { referredById: referrer.id },
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => grantReferralReward(referred.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does nothing for a coach nobody referred', async () => {
    const solo = await makeCoach('solo', 10);
    expect(await grantReferralReward(solo.id)).toBeNull();
  });

  it('does not fail when the referrer has no active subscription', async () => {
    const referrer = await makeCoach('r4', null);
    const referred = await makeCoach('r4b', 10);
    await prisma.trainerProfile.update({
      where: { id: referred.id },
      data: { referredById: referrer.id },
    });

    // The referred coach still gets their days; the referrer's grant is a no-op
    // rather than an error, so one lapsed account cannot break the other's.
    const reward = await grantReferralReward(referred.id);
    expect(reward).not.toBeNull();

    const sub = await prisma.subscription.findFirst({
      where: { trainerId: referred.id },
      select: { endsAt: true },
    });
    expect(Math.round((sub!.endsAt!.getTime() - Date.now()) / 864e5)).toBe(40);
  });

  it('pays nothing when the admin has turned referrals off', async () => {
    await prisma.appSetting.update({
      where: { key: 'referral.enabled' },
      data: { value: 'false' },
    });

    const referrer = await makeCoach('r5', 10);
    const referred = await makeCoach('r5b', 10);
    await prisma.trainerProfile.update({
      where: { id: referred.id },
      data: { referredById: referrer.id },
    });

    expect(await grantReferralReward(referred.id)).toBeNull();
    // And the flag stays unclaimed, so turning it back on still works.
    const row = await prisma.trainerProfile.findUnique({
      where: { id: referred.id },
      select: { referralRewardedAt: true },
    });
    expect(row!.referralRewardedAt).toBeNull();

    await prisma.appSetting.update({
      where: { key: 'referral.enabled' },
      data: { value: 'true' },
    });
  });
});

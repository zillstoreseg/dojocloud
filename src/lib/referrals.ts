import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { getSetting } from './settings';
import { notify } from './audit';

/**
 * Coach refers coach.
 *
 * The growth loop with the best economics in the plan: a coach who brings
 * another coach costs nothing to acquire, and paying both sides in
 * subscription days costs the platform only the marginal cost of serving
 * them — never cash.
 *
 * The reward fires once, when the referred coach's *first* payment is
 * approved. Not at signup, because a signup that never pays is worth nothing
 * and rewarding it invites fake accounts; and not on every renewal, because
 * the referrer did the work once.
 */

/** Ambiguous characters removed: a code gets read aloud and typed by hand. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;

export function generateReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

export interface ReferralSettings {
  enabled: boolean;
  rewardDays: number;
}

export async function referralSettings(): Promise<ReferralSettings> {
  const [enabled, rewardDays] = await Promise.all([
    getSetting('referral.enabled'),
    getSetting('referral.reward_days'),
  ]);
  return {
    enabled: enabled === 'true',
    rewardDays: Math.max(0, Number(rewardDays) || 0),
  };
}

/**
 * Returns this coach's invite code, creating one on first use.
 *
 * Retries on collision rather than trusting a single draw. Seven characters
 * from a 32-symbol alphabet is roughly 34 billion codes, so a collision is
 * vanishingly unlikely — but "vanishingly unlikely" and "handled" are not the
 * same thing, and the unique index would otherwise surface it as a 500 on
 * somebody's dashboard.
 */
export async function ensureReferralCode(trainerId: string): Promise<string> {
  const existing = await prisma.trainerProfile.findUnique({
    where: { id: trainerId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.trainerProfile.update({
        where: { id: trainerId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch {
      // Unique violation — draw again.
    }
  }
  throw new Error('Could not allocate a referral code');
}

/** Resolves an invite code to the coach who owns it, or null. */
export async function resolveReferralCode(code: string): Promise<{ id: string } | null> {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length < 4 || trimmed.length > 16) return null;

  return prisma.trainerProfile.findUnique({
    where: { referralCode: trimmed },
    select: { id: true },
  });
}

export interface ReferralReward {
  referrerId: string;
  referredId: string;
  days: number;
}

/**
 * Grants the reward for a referred coach's first approved payment.
 *
 * Idempotent on `referralRewardedAt`, and the flag is claimed with a
 * conditional `updateMany` before any subscription is touched: two admins
 * approving two payments for the same coach at the same moment must not each
 * see a null flag and each hand out a free month.
 *
 * Both sides are extended from their existing `endsAt` rather than from today,
 * so a reward never shortens a subscription that still has time on it.
 */
export async function grantReferralReward(referredTrainerId: string): Promise<ReferralReward | null> {
  const settings = await referralSettings();
  if (!settings.enabled || settings.rewardDays === 0) return null;

  const referred = await prisma.trainerProfile.findUnique({
    where: { id: referredTrainerId },
    select: { id: true, fullName: true, referredById: true, referralRewardedAt: true },
  });
  if (!referred?.referredById || referred.referralRewardedAt) return null;

  // Claim it. A second caller finds count 0 and stops here.
  const claimed = await prisma.trainerProfile.updateMany({
    where: { id: referredTrainerId, referralRewardedAt: null },
    data: { referralRewardedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  const days = settings.rewardDays;

  const extended = await Promise.all(
    [referred.referredById, referred.id].map((trainerId) =>
      extendActiveSubscription(trainerId, days),
    ),
  );

  const referrer = await prisma.trainerProfile.findUnique({
    where: { id: referred.referredById },
    select: { userId: true, fullName: true },
  });

  if (referrer && extended[0]) {
    await notify({
      userId: referrer.userId,
      type: 'SYSTEM',
      titleAr: `كسبت ${days} يوم مجانًا 🎁`,
      titleEn: `You earned ${days} free days 🎁`,
      bodyAr: `${referred.fullName} اشترك بكود الدعوة بتاعك، فمدّينا اشتراكك ${days} يوم.`,
      bodyEn: `${referred.fullName} subscribed with your invite code, so we extended your plan by ${days} days.`,
      link: '/dash/billing',
    });
  }

  return { referrerId: referred.referredById, referredId: referred.id, days };
}

/** Pushes an active subscription's end date out by `days`. */
async function extendActiveSubscription(trainerId: string, days: number): Promise<boolean> {
  const subscription = await prisma.subscription.findFirst({
    where: { trainerId, status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, endsAt: true },
  });
  if (!subscription) return false;

  const base = subscription.endsAt && subscription.endsAt > new Date() ? subscription.endsAt : new Date();
  const endsAt = new Date(base.getTime() + days * 864e5);

  await prisma.subscription.update({ where: { id: subscription.id }, data: { endsAt } });
  return true;
}

/** What the coach's billing screen shows about their invites. */
export async function referralSummary(trainerId: string): Promise<{
  code: string;
  enabled: boolean;
  rewardDays: number;
  invited: number;
  rewarded: number;
}> {
  const settings = await referralSettings();
  const [code, invited, rewarded] = await Promise.all([
    ensureReferralCode(trainerId),
    prisma.trainerProfile.count({ where: { referredById: trainerId } }),
    prisma.trainerProfile.count({
      where: { referredById: trainerId, referralRewardedAt: { not: null } },
    }),
  ]);

  return { code, enabled: settings.enabled, rewardDays: settings.rewardDays, invited, rewarded };
}

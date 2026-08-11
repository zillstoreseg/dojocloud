import { prisma } from './prisma';

export const QUOTA_KEYS = {
  TRAINEES: 'trainees.active',
  LANDING_PAGES: 'landing.pages',
  EXERCISES: 'exercises',
  NUTRITION_PLANS: 'nutrition.plans',
  AI_GENERATIONS: 'ai.generations',
  STORAGE_MB: 'storage.mb',
} as const;

export type QuotaKey = (typeof QUOTA_KEYS)[keyof typeof QUOTA_KEYS];

export class QuotaExceededError extends Error {
  constructor(
    readonly key: QuotaKey,
    readonly used: number,
    readonly limit: number,
  ) {
    super(`Quota exceeded for ${key}: ${used}/${limit}`);
    this.name = 'QuotaExceededError';
  }
}

export interface QuotaStatus {
  key: QuotaKey;
  used: number;
  /** null = unlimited */
  limit: number | null;
  remaining: number | null;
  exceeded: boolean;
  percent: number;
}

async function activeSubscription(trainerId: string) {
  return prisma.subscription.findFirst({
    where: { trainerId, status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
}

/** Counts that are derived from live rows rather than a stored counter. */
async function liveUsage(trainerId: string, key: QuotaKey): Promise<number | null> {
  switch (key) {
    case QUOTA_KEYS.TRAINEES:
      return prisma.trainee.count({ where: { trainerId, status: 'ACTIVE' } });
    case QUOTA_KEYS.LANDING_PAGES:
      return prisma.landingPage.count({ where: { trainerId } });
    case QUOTA_KEYS.EXERCISES:
      return prisma.exercise.count({ where: { trainerId } });
    case QUOTA_KEYS.NUTRITION_PLANS:
      return prisma.nutritionPlan.count({ where: { trainerId } });
    default:
      return null; // metered counters (AI, storage) live in UsageCounter
  }
}

function limitFor(plan: { maxTrainees: number | null; maxLandingPages: number | null; maxExercises: number | null; maxNutritionPlans: number | null; aiCreditsPerCycle: number; storageMb: number }, key: QuotaKey): number | null {
  switch (key) {
    case QUOTA_KEYS.TRAINEES:
      return plan.maxTrainees;
    case QUOTA_KEYS.LANDING_PAGES:
      return plan.maxLandingPages;
    case QUOTA_KEYS.EXERCISES:
      return plan.maxExercises;
    case QUOTA_KEYS.NUTRITION_PLANS:
      return plan.maxNutritionPlans;
    case QUOTA_KEYS.AI_GENERATIONS:
      return plan.aiCreditsPerCycle;
    case QUOTA_KEYS.STORAGE_MB:
      return plan.storageMb;
    default:
      return null;
  }
}

export async function getQuota(trainerId: string, key: QuotaKey): Promise<QuotaStatus> {
  const sub = await activeSubscription(trainerId);
  if (!sub) return { key, used: 0, limit: 0, remaining: 0, exceeded: true, percent: 100 };

  const limit = limitFor(sub.plan, key);

  let used = await liveUsage(trainerId, key);
  if (used === null) {
    const counter = await prisma.usageCounter.findFirst({
      where: {
        subscriptionId: sub.id,
        key,
        periodStart: { lte: new Date() },
        periodEnd: { gte: new Date() },
      },
      select: { used: true },
    });
    used = counter?.used ?? 0;
  }

  const remaining = limit === null ? null : Math.max(0, limit - used);
  return {
    key,
    used,
    limit,
    remaining,
    exceeded: limit !== null && used >= limit,
    percent: limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100)),
  };
}

/** Throws QuotaExceededError when the trainer is at or over the limit. */
export async function assertQuota(trainerId: string, key: QuotaKey, needed = 1): Promise<QuotaStatus> {
  const status = await getQuota(trainerId, key);
  if (status.limit !== null && status.used + needed > status.limit) {
    throw new QuotaExceededError(key, status.used, status.limit);
  }
  return status;
}

/** Increments a metered counter (AI generations, storage) for the current cycle. */
export async function consumeQuota(trainerId: string, key: QuotaKey, amount = 1): Promise<void> {
  const sub = await activeSubscription(trainerId);
  if (!sub) return;

  const periodStart = sub.startsAt ?? sub.createdAt;
  const periodEnd = sub.endsAt ?? new Date(Date.now() + 30 * 864e5);

  await prisma.usageCounter.upsert({
    where: { subscriptionId_key_periodStart: { subscriptionId: sub.id, key, periodStart } },
    create: { subscriptionId: sub.id, key, used: amount, periodStart, periodEnd },
    update: { used: { increment: amount } },
  });
}

/** Resets all metered counters — called when a payment activates a new cycle. */
export async function resetCounters(subscriptionId: string, periodStart: Date, periodEnd: Date): Promise<void> {
  await prisma.usageCounter.deleteMany({ where: { subscriptionId } });
  await prisma.usageCounter.createMany({
    data: [QUOTA_KEYS.AI_GENERATIONS, QUOTA_KEYS.STORAGE_MB].map((key) => ({
      subscriptionId,
      key,
      used: 0,
      periodStart,
      periodEnd,
    })),
  });
}

/** All quotas at once — for the trainer dashboard usage widget. */
export async function getAllQuotas(trainerId: string): Promise<QuotaStatus[]> {
  return Promise.all(Object.values(QUOTA_KEYS).map((key) => getQuota(trainerId, key)));
}

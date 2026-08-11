import { prisma } from '@/lib/prisma';
import { toUsd, decimalToNumber } from '@/lib/money';
import { eachDay, startOfDay, endOfDay, percentChange } from '@/lib/utils';

export interface DateRange {
  from: Date;
  to: Date;
}

export function rangeOrDefault(from?: Date | null, to?: Date | null, days = 30): DateRange {
  const end = to ? endOfDay(to) : endOfDay(new Date());
  const start = from ? startOfDay(from) : startOfDay(new Date(end.getTime() - (days - 1) * 864e5));
  return { from: start, to: end };
}

/** The equivalent window immediately before `range`, for period-over-period deltas. */
export function previousRange(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span - 1), to: new Date(range.from.getTime() - 1) };
}

// ─────────────────────────────────────────────────────────────── overview ──

export interface OverviewStats {
  mrrUsd: number;
  arrUsd: number;
  arpuUsd: number;
  revenueUsd: number;
  revenueChange: number | null;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  newSubscriptions: number;
  newSubscriptionsChange: number | null;
  churnedSubscriptions: number;
  churnRate: number;
  totalTrainers: number;
  approvedTrainers: number;
  totalTrainees: number;
  activeTrainees: number;
  /** Raw page views — unique visitors live in the funnel. */
  pageViews: number;
  pageViewsChange: number | null;
  leads: number;
  aiCostUsd: number;
  netProfitUsd: number;
  marginPercent: number;
}

export async function getOverviewStats(range: DateRange): Promise<OverviewStats> {
  const prev = previousRange(range);

  const [
    activeSubs,
    trialingSubs,
    newSubs,
    prevNewSubs,
    churned,
    activeAtStart,
    payments,
    prevPayments,
    trainers,
    approvedTrainers,
    trainees,
    activeTrainees,
    visits,
    prevVisits,
    leads,
    aiCost,
  ] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      select: { amount: true, currency: true, plan: { select: { interval: true } } },
    }),
    prisma.subscription.count({ where: { status: 'TRIALING' } }),
    prisma.subscription.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.subscription.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    prisma.subscription.count({
      where: { status: { in: ['CANCELED', 'EXPIRED'] }, updatedAt: { gte: range.from, lte: range.to } },
    }),
    prisma.subscription.count({ where: { createdAt: { lt: range.from }, status: 'ACTIVE' } }),
    prisma.payment.findMany({
      where: { status: 'APPROVED', reviewedAt: { gte: range.from, lte: range.to } },
      select: { amount: true, currency: true },
    }),
    prisma.payment.findMany({
      where: { status: 'APPROVED', reviewedAt: { gte: prev.from, lte: prev.to } },
      select: { amount: true, currency: true },
    }),
    prisma.trainerProfile.count(),
    prisma.trainerProfile.count({ where: { approvalStatus: 'APPROVED' } }),
    prisma.trainee.count(),
    prisma.trainee.count({ where: { status: 'ACTIVE' } }),
    prisma.pageView.count({ where: { createdAt: { gte: range.from, lte: range.to }, isBot: false } }),
    prisma.pageView.count({ where: { createdAt: { gte: prev.from, lte: prev.to }, isBot: false } }),
    prisma.lead.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: range.from, lte: range.to } },
      _sum: { costUsd: true },
    }),
  ]);

  // Normalise every active subscription to a monthly USD figure.
  const mrrUsd = activeSubs.reduce((sum, sub) => {
    const monthly =
      sub.plan.interval === 'YEARLY'
        ? decimalToNumber(sub.amount) / 12
        : sub.plan.interval === 'QUARTERLY'
          ? decimalToNumber(sub.amount) / 3
          : decimalToNumber(sub.amount);
    return sum + toUsd(monthly, sub.currency);
  }, 0);

  const revenueUsd = payments.reduce((s, p) => s + toUsd(decimalToNumber(p.amount), p.currency), 0);
  const prevRevenueUsd = prevPayments.reduce((s, p) => s + toUsd(decimalToNumber(p.amount), p.currency), 0);

  const aiCostUsd = decimalToNumber(aiCost._sum.costUsd);
  const netProfitUsd = revenueUsd - aiCostUsd;

  return {
    mrrUsd,
    arrUsd: mrrUsd * 12,
    arpuUsd: activeSubs.length > 0 ? mrrUsd / activeSubs.length : 0,
    revenueUsd,
    revenueChange: percentChange(revenueUsd, prevRevenueUsd),
    activeSubscriptions: activeSubs.length,
    trialingSubscriptions: trialingSubs,
    newSubscriptions: newSubs,
    newSubscriptionsChange: percentChange(newSubs, prevNewSubs),
    churnedSubscriptions: churned,
    churnRate: activeAtStart > 0 ? Math.round((churned / activeAtStart) * 1000) / 10 : 0,
    totalTrainers: trainers,
    approvedTrainers,
    totalTrainees: trainees,
    activeTrainees,
    pageViews: visits,
    pageViewsChange: percentChange(visits, prevVisits),
    leads,
    aiCostUsd,
    netProfitUsd,
    marginPercent: revenueUsd > 0 ? Math.round((netProfitUsd / revenueUsd) * 1000) / 10 : 0,
  };
}

// ──────────────────────────────────────────────────────────────── revenue ──

export type DailyPoint = {
  date: string;
  revenue: number;
  payments: number;
};

export async function getRevenueSeries(range: DateRange): Promise<DailyPoint[]> {
  const payments = await prisma.payment.findMany({
    where: { status: 'APPROVED', reviewedAt: { gte: range.from, lte: range.to } },
    select: { amount: true, currency: true, reviewedAt: true },
  });

  const buckets = new Map<string, { revenue: number; payments: number }>();
  for (const day of eachDay(range.from, range.to)) {
    buckets.set(day.toISOString().slice(0, 10), { revenue: 0, payments: 0 });
  }
  for (const payment of payments) {
    if (!payment.reviewedAt) continue;
    const key = payment.reviewedAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.revenue += toUsd(decimalToNumber(payment.amount), payment.currency);
    bucket.payments += 1;
  }

  return [...buckets.entries()].map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue * 100) / 100,
    payments: v.payments,
  }));
}

export async function getRevenueBreakdown(range: DateRange) {
  const payments = await prisma.payment.findMany({
    where: { status: 'APPROVED', reviewedAt: { gte: range.from, lte: range.to } },
    select: {
      amount: true,
      currency: true,
      method: true,
      subscription: {
        select: {
          plan: { select: { id: true, nameAr: true, nameEn: true } },
          trainer: { select: { country: true } },
        },
      },
    },
  });

  const byPlan = new Map<string, { nameAr: string; nameEn: string; revenue: number; count: number }>();
  const byMethod = new Map<string, number>();
  const byCurrency = new Map<string, number>();
  const byCountry = new Map<string, number>();

  for (const p of payments) {
    const usd = toUsd(decimalToNumber(p.amount), p.currency);
    const plan = p.subscription.plan;

    const planEntry = byPlan.get(plan.id) ?? { nameAr: plan.nameAr, nameEn: plan.nameEn, revenue: 0, count: 0 };
    planEntry.revenue += usd;
    planEntry.count += 1;
    byPlan.set(plan.id, planEntry);

    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + usd);
    byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + decimalToNumber(p.amount));
    const country = p.subscription.trainer.country || 'Unknown';
    byCountry.set(country, (byCountry.get(country) ?? 0) + usd);
  }

  const sortDesc = <T extends { revenue: number }>(a: T, b: T) => b.revenue - a.revenue;

  return {
    byPlan: [...byPlan.entries()].map(([id, v]) => ({ id, ...v })).sort(sortDesc),
    byMethod: [...byMethod.entries()].map(([method, revenue]) => ({ method, revenue })).sort(sortDesc),
    byCurrency: [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
    byCountry: [...byCountry.entries()].map(([country, revenue]) => ({ country, revenue })).sort(sortDesc),
  };
}

// ───────────────────────────────────────────────────────── profit margins ──

export interface PlanProfit {
  planId: string;
  nameAr: string;
  nameEn: string;
  revenueUsd: number;
  aiCostUsd: number;
  otherCostUsd: number;
  netUsd: number;
  marginPercent: number;
  subscribers: number;
}

/**
 * Revenue minus real costs, per plan. AI cost is attributed through each
 * trainer's active subscription, which is what makes "which plan actually makes
 * money" answerable rather than guessed.
 */
export async function getPlanProfit(range: DateRange): Promise<PlanProfit[]> {
  const [plans, payments, aiUsage, costs] = await Promise.all([
    prisma.plan.findMany({ select: { id: true, nameAr: true, nameEn: true } }),
    prisma.payment.findMany({
      where: { status: 'APPROVED', reviewedAt: { gte: range.from, lte: range.to } },
      select: { amount: true, currency: true, subscription: { select: { planId: true, trainerId: true } } },
    }),
    prisma.aiUsage.findMany({
      where: { createdAt: { gte: range.from, lte: range.to }, trainerId: { not: null } },
      select: { trainerId: true, costUsd: true },
    }),
    prisma.costRecord.findMany({
      where: { occurredAt: { gte: range.from, lte: range.to }, kind: { not: 'AI' } },
      select: { planId: true, trainerId: true, amountUsd: true },
    }),
  ]);

  // Map each trainer to the plan they are currently on, so AI spend lands on
  // the right plan even when the usage row predates the latest payment.
  const activeSubs = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIALING'] } },
    select: { trainerId: true, planId: true },
  });
  const trainerPlan = new Map(activeSubs.map((s) => [s.trainerId, s.planId]));

  const acc = new Map<string, { revenue: number; ai: number; other: number; subs: Set<string> }>();
  const bucket = (planId: string) => {
    let entry = acc.get(planId);
    if (!entry) {
      entry = { revenue: 0, ai: 0, other: 0, subs: new Set() };
      acc.set(planId, entry);
    }
    return entry;
  };

  for (const p of payments) {
    const entry = bucket(p.subscription.planId);
    entry.revenue += toUsd(decimalToNumber(p.amount), p.currency);
    entry.subs.add(p.subscription.trainerId);
  }
  for (const usage of aiUsage) {
    const planId = usage.trainerId ? trainerPlan.get(usage.trainerId) : undefined;
    if (!planId) continue;
    bucket(planId).ai += decimalToNumber(usage.costUsd);
  }
  for (const cost of costs) {
    const planId = cost.planId ?? (cost.trainerId ? trainerPlan.get(cost.trainerId) : undefined);
    if (!planId) continue;
    bucket(planId).other += decimalToNumber(cost.amountUsd);
  }

  return plans
    .map((plan) => {
      const entry = acc.get(plan.id) ?? { revenue: 0, ai: 0, other: 0, subs: new Set<string>() };
      const net = entry.revenue - entry.ai - entry.other;
      return {
        planId: plan.id,
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        revenueUsd: Math.round(entry.revenue * 100) / 100,
        aiCostUsd: Math.round(entry.ai * 10000) / 10000,
        otherCostUsd: Math.round(entry.other * 10000) / 10000,
        netUsd: Math.round(net * 100) / 100,
        marginPercent: entry.revenue > 0 ? Math.round((net / entry.revenue) * 1000) / 10 : 0,
        subscribers: entry.subs.size,
      };
    })
    .sort((a, b) => b.netUsd - a.netUsd);
}

/** Trainers whose cost to serve exceeds what they paid in the window. */
export async function getUnprofitableTrainers(range: DateRange, limit = 20) {
  const [payments, aiUsage] = await Promise.all([
    prisma.payment.findMany({
      where: { status: 'APPROVED', reviewedAt: { gte: range.from, lte: range.to } },
      select: { amount: true, currency: true, subscription: { select: { trainerId: true } } },
    }),
    prisma.aiUsage.groupBy({
      by: ['trainerId'],
      where: { createdAt: { gte: range.from, lte: range.to }, trainerId: { not: null } },
      _sum: { costUsd: true },
    }),
  ]);

  const revenue = new Map<string, number>();
  for (const p of payments) {
    const id = p.subscription.trainerId;
    revenue.set(id, (revenue.get(id) ?? 0) + toUsd(decimalToNumber(p.amount), p.currency));
  }

  const rows = aiUsage
    .filter((u) => u.trainerId)
    .map((u) => {
      const trainerId = u.trainerId as string;
      const cost = decimalToNumber(u._sum.costUsd);
      const rev = revenue.get(trainerId) ?? 0;
      return { trainerId, revenueUsd: rev, costUsd: cost, netUsd: rev - cost };
    })
    .filter((r) => r.netUsd < 0)
    .sort((a, b) => a.netUsd - b.netUsd)
    .slice(0, limit);

  if (rows.length === 0) return [];

  const trainers = await prisma.trainerProfile.findMany({
    where: { id: { in: rows.map((r) => r.trainerId) } },
    select: { id: true, fullName: true, username: true },
  });
  const byId = new Map(trainers.map((t) => [t.id, t]));

  return rows.map((row) => ({ ...row, trainer: byId.get(row.trainerId) ?? null }));
}

// ──────────────────────────────────────────────────────────────── traffic ──

export interface TrafficStats {
  views: number;
  sessions: number;
  leads: number;
  conversions: number;
  series: Array<{ date: string; views: number; sessions: number }>;
  topPages: Array<{ path: string; views: number }>;
  topSources: Array<{ source: string; views: number }>;
  byCountry: Array<{ country: string; views: number }>;
  byDevice: Array<{ device: string; views: number }>;
  topTrainerPages: Array<{ trainerId: string; name: string; username: string; views: number; leads: number }>;
}

export async function getTrafficStats(range: DateRange): Promise<TrafficStats> {
  const views = await prisma.pageView.findMany({
    where: { createdAt: { gte: range.from, lte: range.to }, isBot: false },
    select: {
      path: true,
      sessionId: true,
      referrer: true,
      utmSource: true,
      country: true,
      device: true,
      trainerId: true,
      createdAt: true,
    },
  });

  const [leads, conversions] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.lead.count({
      where: { createdAt: { gte: range.from, lte: range.to }, status: 'CONVERTED' },
    }),
  ]);

  const dayBuckets = new Map<string, { views: number; sessions: Set<string> }>();
  for (const day of eachDay(range.from, range.to)) {
    dayBuckets.set(day.toISOString().slice(0, 10), { views: 0, sessions: new Set() });
  }

  const pathCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();
  const countryCount = new Map<string, number>();
  const deviceCount = new Map<string, number>();
  const trainerCount = new Map<string, number>();
  const allSessions = new Set<string>();

  for (const view of views) {
    const key = view.createdAt.toISOString().slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (bucket) {
      bucket.views += 1;
      bucket.sessions.add(view.sessionId);
    }
    allSessions.add(view.sessionId);

    pathCount.set(view.path, (pathCount.get(view.path) ?? 0) + 1);

    const source =
      view.utmSource ||
      (view.referrer ? safeHost(view.referrer) : null) ||
      'direct';
    sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1);

    countryCount.set(view.country ?? 'Unknown', (countryCount.get(view.country ?? 'Unknown') ?? 0) + 1);
    deviceCount.set(view.device ?? 'unknown', (deviceCount.get(view.device ?? 'unknown') ?? 0) + 1);
    if (view.trainerId) trainerCount.set(view.trainerId, (trainerCount.get(view.trainerId) ?? 0) + 1);
  }

  const topTrainerIds = [...trainerCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  const [trainers, leadCounts] = await Promise.all([
    topTrainerIds.length
      ? prisma.trainerProfile.findMany({
          where: { id: { in: topTrainerIds } },
          select: { id: true, fullName: true, username: true },
        })
      : Promise.resolve([]),
    topTrainerIds.length
      ? prisma.lead.groupBy({
          by: ['trainerId'],
          where: { trainerId: { in: topTrainerIds }, createdAt: { gte: range.from, lte: range.to } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const trainerById = new Map(trainers.map((t) => [t.id, t]));
  const leadsByTrainer = new Map(leadCounts.map((l) => [l.trainerId, l._count._all]));

  const top = <T>(map: Map<string, number>, label: string, n = 10) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, value]) => ({ [label]: key, views: value })) as T[];

  return {
    views: views.length,
    sessions: allSessions.size,
    leads,
    conversions,
    series: [...dayBuckets.entries()].map(([date, v]) => ({
      date,
      views: v.views,
      sessions: v.sessions.size,
    })),
    topPages: top<{ path: string; views: number }>(pathCount, 'path'),
    topSources: top<{ source: string; views: number }>(sourceCount, 'source'),
    byCountry: top<{ country: string; views: number }>(countryCount, 'country'),
    byDevice: top<{ device: string; views: number }>(deviceCount, 'device', 5),
    topTrainerPages: topTrainerIds.map((id) => ({
      trainerId: id,
      name: trainerById.get(id)?.fullName ?? '—',
      username: trainerById.get(id)?.username ?? '',
      views: trainerCount.get(id) ?? 0,
      leads: leadsByTrainer.get(id) ?? 0,
    })),
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────── funnel ──

export interface Funnel {
  visitors: number;
  leads: number;
  trainees: number;
  paidTrainees: number;
  leadRate: number;
  traineeRate: number;
  paidRate: number;
}

export async function getFunnel(range: DateRange): Promise<Funnel> {
  const [sessions, leads, converted, paid] = await Promise.all([
    prisma.pageView.findMany({
      where: { createdAt: { gte: range.from, lte: range.to }, isBot: false },
      select: { sessionId: true },
      distinct: ['sessionId'],
    }),
    prisma.lead.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.lead.count({
      where: { createdAt: { gte: range.from, lte: range.to }, status: 'CONVERTED' },
    }),
    prisma.traineeSubscription.count({
      where: { status: 'APPROVED', createdAt: { gte: range.from, lte: range.to } },
    }),
  ]);

  const visitors = sessions.length;
  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  return {
    visitors,
    leads,
    trainees: converted,
    paidTrainees: paid,
    leadRate: rate(leads, visitors),
    traineeRate: rate(converted, leads),
    paidRate: rate(paid, converted),
  };
}

// ───────────────────────────────────────────────────────────── ai & subs ──

export async function getAiStats(range: DateRange) {
  const [totals, byFeature, topUsers, series] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.aiUsage.groupBy({
      by: ['feature'],
      where: { createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
    prisma.aiUsage.groupBy({
      by: ['trainerId'],
      where: { createdAt: { gte: range.from, lte: range.to }, trainerId: { not: null } },
      _count: { _all: true },
      _sum: { costUsd: true },
      orderBy: { _sum: { costUsd: 'desc' } },
      take: 10,
    }),
    prisma.aiUsage.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, costUsd: true, success: true },
    }),
  ]);

  const failures = series.filter((s) => !s.success).length;
  const dayBuckets = new Map<string, { calls: number; cost: number }>();
  for (const day of eachDay(range.from, range.to)) {
    dayBuckets.set(day.toISOString().slice(0, 10), { calls: 0, cost: 0 });
  }
  for (const row of series) {
    const bucket = dayBuckets.get(row.createdAt.toISOString().slice(0, 10));
    if (!bucket) continue;
    bucket.calls += 1;
    bucket.cost += decimalToNumber(row.costUsd);
  }

  const trainerIds = topUsers.map((u) => u.trainerId).filter(Boolean) as string[];
  const trainers = trainerIds.length
    ? await prisma.trainerProfile.findMany({
        where: { id: { in: trainerIds } },
        select: { id: true, fullName: true, username: true },
      })
    : [];
  const byId = new Map(trainers.map((t) => [t.id, t]));

  return {
    calls: totals._count._all,
    costUsd: decimalToNumber(totals._sum.costUsd),
    inputTokens: totals._sum.inputTokens ?? 0,
    outputTokens: totals._sum.outputTokens ?? 0,
    failures,
    failureRate: totals._count._all > 0 ? Math.round((failures / totals._count._all) * 1000) / 10 : 0,
    byFeature: byFeature.map((f) => ({
      feature: f.feature,
      calls: f._count._all,
      costUsd: decimalToNumber(f._sum.costUsd),
    })),
    topUsers: topUsers.map((u) => ({
      trainerId: u.trainerId as string,
      name: byId.get(u.trainerId as string)?.fullName ?? '—',
      username: byId.get(u.trainerId as string)?.username ?? '',
      calls: u._count._all,
      costUsd: decimalToNumber(u._sum.costUsd),
    })),
    series: [...dayBuckets.entries()].map(([date, v]) => ({
      date,
      calls: v.calls,
      cost: Math.round(v.cost * 10000) / 10000,
    })),
  };
}

export async function getSubscriptionStats(range: DateRange) {
  const [created, canceled, byStatus, byPlan] = await Promise.all([
    prisma.subscription.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true },
    }),
    prisma.subscription.findMany({
      where: { status: { in: ['CANCELED', 'EXPIRED'] }, updatedAt: { gte: range.from, lte: range.to } },
      select: { updatedAt: true },
    }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      _count: { _all: true },
    }),
  ]);

  const buckets = new Map<string, { created: number; canceled: number }>();
  for (const day of eachDay(range.from, range.to)) {
    buckets.set(day.toISOString().slice(0, 10), { created: 0, canceled: 0 });
  }
  for (const row of created) {
    const b = buckets.get(row.createdAt.toISOString().slice(0, 10));
    if (b) b.created += 1;
  }
  for (const row of canceled) {
    const b = buckets.get(row.updatedAt.toISOString().slice(0, 10));
    if (b) b.canceled += 1;
  }

  const plans = await prisma.plan.findMany({ select: { id: true, nameAr: true, nameEn: true } });
  const planById = new Map(plans.map((p) => [p.id, p]));

  return {
    series: [...buckets.entries()].map(([date, v]) => ({ date, ...v })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    byPlan: byPlan.map((p) => ({
      planId: p.planId,
      nameAr: planById.get(p.planId)?.nameAr ?? '—',
      nameEn: planById.get(p.planId)?.nameEn ?? '—',
      count: p._count._all,
    })),
  };
}

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  nextCycle,
  trialCycle,
  checkCoupon,
  priceAfterCoupon,
  daysRemaining,
} from '@/lib/billing';

const NOW = new Date('2026-06-15T12:00:00Z');
const d = (iso: string) => new Date(iso);

describe('nextCycle', () => {
  it('starts from today for a first payment', () => {
    const cycle = nextCycle(null, 'MONTHLY', NOW);
    expect(cycle.startsAt).toEqual(NOW);
    expect(cycle.endsAt).toEqual(d('2026-07-15T12:00:00Z'));
  });

  it('extends from the current end date when renewing early', () => {
    // Paying 10 days before expiry must not throw those days away.
    const currentEnd = d('2026-06-25T12:00:00Z');
    const cycle = nextCycle(currentEnd, 'MONTHLY', NOW);
    expect(cycle.startsAt).toEqual(currentEnd);
    expect(cycle.endsAt).toEqual(d('2026-07-25T12:00:00Z'));
  });

  it('starts from today when the previous period already lapsed', () => {
    const cycle = nextCycle(d('2026-06-01T12:00:00Z'), 'MONTHLY', NOW);
    expect(cycle.startsAt).toEqual(NOW);
  });

  it('handles quarterly and yearly intervals', () => {
    expect(nextCycle(null, 'QUARTERLY', NOW).endsAt).toEqual(d('2026-09-15T12:00:00Z'));
    expect(nextCycle(null, 'YEARLY', NOW).endsAt).toEqual(d('2027-06-15T12:00:00Z'));
  });
});

describe('trialCycle', () => {
  it('returns null when the plan has no trial', () => {
    expect(trialCycle(0, NOW)).toBeNull();
  });

  it('spans the requested number of days', () => {
    const cycle = trialCycle(14, NOW)!;
    expect(cycle.endsAt).toEqual(d('2026-06-29T12:00:00Z'));
  });
});

describe('checkCoupon', () => {
  const base = {
    isActive: true,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    usedCount: 0,
    planIds: [] as string[],
  };

  it('accepts a healthy coupon on any plan when planIds is empty', () => {
    expect(checkCoupon(base, 'plan_pro', NOW)).toBeNull();
  });

  it('rejects a missing code', () => {
    expect(checkCoupon(null, 'plan_pro', NOW)).toBe('not_found');
  });

  it('rejects an inactive, unstarted, or expired coupon', () => {
    expect(checkCoupon({ ...base, isActive: false }, 'plan_pro', NOW)).toBe('inactive');
    expect(checkCoupon({ ...base, startsAt: d('2026-07-01T00:00:00Z') }, 'plan_pro', NOW)).toBe(
      'not_started',
    );
    expect(checkCoupon({ ...base, expiresAt: d('2026-06-01T00:00:00Z') }, 'plan_pro', NOW)).toBe(
      'expired',
    );
  });

  it('rejects once redemptions run out', () => {
    expect(checkCoupon({ ...base, maxRedemptions: 5, usedCount: 5 }, 'plan_pro', NOW)).toBe(
      'exhausted',
    );
    expect(checkCoupon({ ...base, maxRedemptions: 5, usedCount: 4 }, 'plan_pro', NOW)).toBeNull();
  });

  it('rejects a coupon scoped to other plans', () => {
    const scoped = { ...base, planIds: ['plan_elite'] };
    expect(checkCoupon(scoped, 'plan_pro', NOW)).toBe('wrong_plan');
    expect(checkCoupon(scoped, 'plan_elite', NOW)).toBeNull();
  });
});

describe('priceAfterCoupon', () => {
  it('returns the base price with no coupon', () => {
    expect(priceAfterCoupon(899, null)).toBe(899);
  });

  it('applies a percentage discount', () => {
    expect(priceAfterCoupon(1000, { type: 'PERCENT', value: new Prisma.Decimal(20) })).toBe(800);
  });

  it('applies a fixed discount', () => {
    expect(priceAfterCoupon(899, { type: 'FIXED', value: new Prisma.Decimal(100) })).toBe(799);
  });

  it('never goes below zero', () => {
    expect(priceAfterCoupon(50, { type: 'FIXED', value: new Prisma.Decimal(500) })).toBe(0);
  });
});

describe('daysRemaining', () => {
  it('is zero for a missing or past end date', () => {
    expect(daysRemaining(null, NOW)).toBe(0);
    expect(daysRemaining(d('2026-06-01T12:00:00Z'), NOW)).toBe(0);
  });

  it('rounds a partial day up, so "1 day left" never reads as zero', () => {
    expect(daysRemaining(d('2026-06-16T06:00:00Z'), NOW)).toBe(1);
    expect(daysRemaining(d('2026-06-22T12:00:00Z'), NOW)).toBe(7);
  });
});

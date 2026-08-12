import type { BillingInterval, Coupon } from '@prisma/client';
import { addInterval } from './utils';
import { applyCoupon, decimalToNumber } from './money';

/**
 * Billing arithmetic, kept free of Prisma calls so it can be unit-tested.
 *
 * The rules here decide what a trainer actually pays and how long they keep
 * access, so they are the part of the money path most worth pinning down with
 * tests rather than reading off a screen.
 */

export interface CyclePeriod {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Works out the period a newly approved payment buys.
 *
 * Paying before the current period ends extends from `endsAt`, not from today
 * — otherwise renewing early would silently throw away the days already paid
 * for, which is the kind of quiet loss that costs trust.
 */
export function nextCycle(
  currentEndsAt: Date | null | undefined,
  interval: BillingInterval,
  now: Date = new Date(),
): CyclePeriod {
  const startsAt = currentEndsAt && currentEndsAt > now ? currentEndsAt : now;
  return { startsAt, endsAt: addInterval(startsAt, interval) };
}

/** The trial window a plan grants, or null when it has no trial. */
export function trialCycle(trialDays: number, now: Date = new Date()): CyclePeriod | null {
  if (trialDays <= 0) return null;
  return { startsAt: now, endsAt: new Date(now.getTime() + trialDays * 864e5) };
}

export type CouponRejection =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'wrong_plan';

export const COUPON_MESSAGES: Record<CouponRejection, { ar: string; en: string }> = {
  not_found: { ar: 'كود الخصم غير صحيح', en: 'That discount code is not valid' },
  inactive: { ar: 'كود الخصم غير مفعّل', en: 'That discount code is not active' },
  not_started: { ar: 'كود الخصم لم يبدأ بعد', en: 'That discount code has not started yet' },
  expired: { ar: 'كود الخصم منتهي الصلاحية', en: 'That discount code has expired' },
  exhausted: { ar: 'تم استهلاك كود الخصم بالكامل', en: 'That discount code has been fully used' },
  wrong_plan: { ar: 'كود الخصم لا ينطبق على هذه الخطة', en: 'That code does not apply to this plan' },
};

/**
 * Validates a coupon against a plan. Returns the reason it was rejected rather
 * than a bare boolean, so the screen can say *why* instead of "invalid".
 *
 * `planIds` empty means the coupon applies to every plan.
 */
export function checkCoupon(
  coupon: Pick<Coupon, 'isActive' | 'startsAt' | 'expiresAt' | 'maxRedemptions' | 'usedCount' | 'planIds'> | null,
  planId: string,
  now: Date = new Date(),
): CouponRejection | null {
  if (!coupon) return 'not_found';
  if (!coupon.isActive) return 'inactive';
  if (coupon.startsAt && coupon.startsAt > now) return 'not_started';
  if (coupon.expiresAt && coupon.expiresAt < now) return 'expired';
  if (coupon.maxRedemptions !== null && coupon.usedCount >= coupon.maxRedemptions) return 'exhausted';
  if (coupon.planIds.length > 0 && !coupon.planIds.includes(planId)) return 'wrong_plan';
  return null;
}

/**
 * Final amount for a plan in a currency, after an optional coupon.
 * Rounded to two decimals; never negative.
 */
export function priceAfterCoupon(
  basePrice: number,
  coupon: Pick<Coupon, 'type' | 'value'> | null,
): number {
  if (!coupon) return Math.max(0, Math.round(basePrice * 100) / 100);
  return applyCoupon(basePrice, { type: coupon.type, value: decimalToNumber(coupon.value) });
}

/** Days left on a subscription, floored at zero. Used for renewal nudges. */
export function daysRemaining(endsAt: Date | null | undefined, now: Date = new Date()): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 864e5));
}

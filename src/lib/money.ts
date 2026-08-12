import type { Prisma } from '@prisma/client';

/**
 * Arabic locale pinned to Latin digits. Egyptian and Gulf users read prices and
 * dashboard figures in Western numerals; Arabic-Indic digits also break
 * alignment in data tables where some cells are Latin-only.
 */
export const AR_LOCALE = 'ar-EG-u-nu-latn';

/** Resolves an app locale to the Intl locale used for every figure we print. */
export function intlLocale(locale: string): string {
  return locale === 'ar' ? AR_LOCALE : 'en-US';
}

export const SUPPORTED_CURRENCIES = ['EGP', 'AED', 'SAR', 'USD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABELS: Record<Currency, { ar: string; en: string }> = {
  EGP: { ar: 'جنيه مصري', en: 'Egyptian Pound' },
  AED: { ar: 'درهم إماراتي', en: 'UAE Dirham' },
  SAR: { ar: 'ريال سعودي', en: 'Saudi Riyal' },
  USD: { ar: 'دولار أمريكي', en: 'US Dollar' },
};

/**
 * Indicative rates to USD, used only to aggregate revenue across currencies in
 * admin reports. Editable later from settings; never used to charge a customer.
 */
export const USD_RATES: Record<Currency, number> = {
  EGP: 0.0205,
  AED: 0.2723,
  SAR: 0.2666,
  USD: 1,
};

/** Display names for the manual payment methods, used wherever one is shown. */
export const PAYMENT_METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  INSTAPAY: { ar: 'إنستاباي', en: 'InstaPay' },
  VODAFONE_CASH: { ar: 'فودافون كاش', en: 'Vodafone Cash' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank transfer' },
  MANUAL_TRANSFER: { ar: 'تحويل يدوي', en: 'Manual transfer' },
  CARD: { ar: 'بطاقة', en: 'Card' },
  WALLET: { ar: 'محفظة إلكترونية', en: 'Wallet' },
};

export function paymentMethodLabel(method: string, locale = 'ar'): string {
  const entry = PAYMENT_METHOD_LABELS[method];
  if (!entry) return method;
  return locale === 'ar' ? entry.ar : entry.en;
}

export function toUsd(amount: number, currency: string): number {
  const rate = USD_RATES[currency as Currency] ?? 1;
  return amount * rate;
}

export function formatMoney(
  amount: number | string | Prisma.Decimal,
  currency = 'EGP',
  locale = 'ar',
): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  return new Intl.NumberFormat(locale === 'ar' ? AR_LOCALE : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function formatNumber(value: number, locale = 'ar'): string {
  return new Intl.NumberFormat(locale === 'ar' ? AR_LOCALE : 'en-US').format(value);
}

export function formatPercent(value: number, locale = 'ar'): string {
  return new Intl.NumberFormat(locale === 'ar' ? AR_LOCALE : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** Reads a price out of a plan's multi-currency map, falling back sensibly. */
export function planPrice(prices: unknown, currency: string): number {
  if (!prices || typeof prices !== 'object') return 0;
  const map = prices as Record<string, unknown>;
  const direct = map[currency];
  if (typeof direct === 'number') return direct;
  const fallback = map.EGP ?? map.USD ?? Object.values(map)[0];
  return typeof fallback === 'number' ? fallback : 0;
}

export function applyCoupon(
  amount: number,
  coupon: { type: 'PERCENT' | 'FIXED'; value: number | Prisma.Decimal } | null,
): number {
  if (!coupon) return amount;
  const value = Number(coupon.value);
  const discounted = coupon.type === 'PERCENT' ? amount * (1 - value / 100) : amount - value;
  return Math.max(0, Math.round(discounted * 100) / 100);
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

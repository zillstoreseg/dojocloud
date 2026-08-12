import { cache } from 'react';
import { prisma } from './prisma';
import { decryptSecret, encryptSecret } from './crypto';
import { publicEnv } from './env';

/** Every admin-editable setting, with its default and whether it holds a secret. */
export const SETTING_DEFS = {
  // Brand
  'brand.name': { default: publicEnv.appName, secret: false, category: 'brand' },
  'brand.tagline_ar': { default: 'مدربك معاك في أي وقت', secret: false, category: 'brand' },
  'brand.tagline_en': { default: 'Your coach, anytime', secret: false, category: 'brand' },
  'brand.logo_url': { default: '', secret: false, category: 'brand' },
  // HSL triples, so the value drops straight into `hsl(var(--primary))`.
  'brand.primary_color': { default: '164 78% 27%', secret: false, category: 'brand' },
  'brand.accent_color': { default: '30 79% 57%', secret: false, category: 'brand' },
  'brand.support_email': { default: '', secret: false, category: 'brand' },
  'brand.support_phone': { default: '', secret: false, category: 'brand' },

  // Localisation & money
  'app.default_locale': { default: 'ar', secret: false, category: 'app' },
  'app.default_currency': { default: 'EGP', secret: false, category: 'app' },
  'app.currencies': { default: 'EGP,AED,SAR,USD', secret: false, category: 'app' },
  'app.maintenance_mode': { default: 'false', secret: false, category: 'app' },
  'app.allow_trainer_signup': { default: 'true', secret: false, category: 'app' },

  // Manual payment instructions shown on the checkout screen
  'payment.instructions_ar': { default: '', secret: false, category: 'payment' },
  'payment.instructions_en': { default: '', secret: false, category: 'payment' },
  'payment.bank_name': { default: '', secret: false, category: 'payment' },
  'payment.bank_account': { default: '', secret: false, category: 'payment' },
  'payment.instapay': { default: '', secret: false, category: 'payment' },
  'payment.vodafone_cash': { default: '', secret: false, category: 'payment' },
  'payment.active_provider': { default: 'manual', secret: false, category: 'payment' },
  'payment.kashier_api_key': { default: '', secret: true, category: 'payment' },
  'payment.ziina_api_key': { default: '', secret: true, category: 'payment' },

  // AI
  'ai.api_key': { default: '', secret: true, category: 'ai' },
  'ai.model': { default: 'claude-opus-5', secret: false, category: 'ai' },
  'ai.effort': { default: 'medium', secret: false, category: 'ai' },
  'ai.input_price_per_mtok': { default: '5', secret: false, category: 'ai' },
  'ai.output_price_per_mtok': { default: '25', secret: false, category: 'ai' },

  // Email
  'email.provider': { default: 'none', secret: false, category: 'email' },
  'email.from': { default: '', secret: false, category: 'email' },
  'email.resend_api_key': { default: '', secret: true, category: 'email' },
  'email.smtp_host': { default: '', secret: false, category: 'email' },
  'email.smtp_port': { default: '587', secret: false, category: 'email' },
  'email.smtp_user': { default: '', secret: false, category: 'email' },
  'email.smtp_password': { default: '', secret: true, category: 'email' },
  /// Which in-app notifications also go out as email.
  'email.notify_types': {
    default: 'ACCOUNT_APPROVED,ACCOUNT_REJECTED,PAYMENT_APPROVED,PAYMENT_REJECTED,SUBSCRIPTION_EXPIRING,SUBSCRIPTION_EXPIRED,TRAINEE_RENEWAL_DUE,NEW_LEAD',
    secret: false,
    category: 'email',
  },

  // Referrals
  'referral.enabled': { default: 'true', secret: false, category: 'referral' },
  /// Free days granted to each side when a referred coach starts paying.
  'referral.reward_days': { default: '30', secret: false, category: 'referral' },

  // Coach payouts
  'payout.enabled': { default: 'true', secret: false, category: 'payout' },
  'payout.min_amount': { default: '500', secret: false, category: 'payout' },
  'payout.max_per_request': { default: '20000', secret: false, category: 'payout' },
  'payout.max_per_month': { default: '50000', secret: false, category: 'payout' },
  /// Days a credit sits in `pendingBalance` before it can be withdrawn.
  'payout.hold_days': { default: '7', secret: false, category: 'payout' },
  'payout.methods': {
    default: 'BANK,INSTAPAY,VODAFONE_CASH,WISE',
    secret: false,
    category: 'payout',
  },

  // SEO
  'seo.title_ar': { default: '', secret: false, category: 'seo' },
  'seo.title_en': { default: '', secret: false, category: 'seo' },
  'seo.description_ar': { default: '', secret: false, category: 'seo' },
  'seo.description_en': { default: '', secret: false, category: 'seo' },
  'seo.og_image': { default: '', secret: false, category: 'seo' },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;

/**
 * Reads a stored value, decrypting it when needed.
 *
 * A value that cannot be decrypted falls back to the default rather than
 * throwing. The realistic cause is a rotated `SETTINGS_ENCRYPTION_KEY`, and the
 * blast radius of throwing is out of all proportion to it: `getSettings` reads
 * a whole category at once, so one unreadable row would take down every screen
 * that touches that category — including the settings screen where an admin
 * would go to fix it.
 */
function readValue(
  row: { value: string; isEncrypted: boolean },
  fallback: string,
  key: string,
): string {
  if (!row.value) return fallback;
  if (!row.isEncrypted) return row.value;
  try {
    return decryptSecret(row.value);
  } catch {
    console.error(`[settings] could not decrypt "${key}" — falling back to its default`);
    return fallback;
  }
}

/** Reads one setting, decrypting it when needed. Falls back to the default. */
export async function getSetting(key: SettingKey): Promise<string> {
  const def = SETTING_DEFS[key];
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return def.default;
  return readValue(row, def.default, key);
}

/** Reads a whole category at once, e.g. all brand or all payment settings. */
export const getSettings = cache(async (category?: string): Promise<Record<string, string>> => {
  const rows = await prisma.appSetting.findMany({
    where: category ? { category } : undefined,
  });
  const result: Record<string, string> = {};

  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    if (category && def.category !== category) continue;
    result[key] = def.default;
  }
  for (const row of rows) {
    if (category && row.category !== category) continue;
    const def = SETTING_DEFS[row.key as SettingKey];
    result[row.key] = readValue(row, def?.default ?? '', row.key);
  }
  return result;
});

export async function setSetting(key: SettingKey, value: string, updatedById?: string): Promise<void> {
  const def = SETTING_DEFS[key];
  const stored = def.secret && value ? encryptSecret(value) : value;
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: stored, isEncrypted: def.secret, category: def.category, updatedById },
    update: { value: stored, isEncrypted: def.secret, category: def.category, updatedById },
  });
}

export async function setSettings(
  values: Partial<Record<SettingKey, string>>,
  updatedById?: string,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await setSetting(key as SettingKey, value, updatedById);
  }
}

export async function isMaintenanceMode(): Promise<boolean> {
  return (await getSetting('app.maintenance_mode')) === 'true';
}

/** Brand values used by layouts and the public site. */
export const getBrand = cache(async () => {
  const s = await getSettings('brand');
  return {
    name: s['brand.name'] || publicEnv.appName,
    taglineAr: s['brand.tagline_ar'] ?? '',
    taglineEn: s['brand.tagline_en'] ?? '',
    logoUrl: s['brand.logo_url'] ?? '',
    primaryColor: s['brand.primary_color'] || SETTING_DEFS['brand.primary_color'].default,
    accentColor: s['brand.accent_color'] || SETTING_DEFS['brand.accent_color'].default,
    supportEmail: s['brand.support_email'] ?? '',
    supportPhone: s['brand.support_phone'] ?? '',
  };
});

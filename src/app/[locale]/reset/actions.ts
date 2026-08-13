'use server';

import { completePasswordReset, MIN_PASSWORD_LENGTH } from '@/lib/password-reset';

export interface ResetResult {
  ok: boolean;
  error?: string;
}

const MESSAGES: Record<string, { ar: string; en: string }> = {
  INVALID: {
    ar: 'الرابط ده مش صالح. اطلب رابط جديد.',
    en: 'This link is not valid. Request a new one.',
  },
  EXPIRED: {
    ar: 'الرابط انتهت صلاحيته. اطلب رابط جديد.',
    en: 'This link has expired. Request a new one.',
  },
  USED: {
    ar: 'الرابط ده اتستخدم قبل كده. اطلب رابط جديد.',
    en: 'This link has already been used. Request a new one.',
  },
  WEAK: {
    ar: `كلمة السر لازم تكون ${MIN_PASSWORD_LENGTH} حروف على الأقل.`,
    en: `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  },
};

/** Spends the token and sets the new password. */
export async function resetPassword(input: {
  token: string;
  password: string;
  confirmPassword: string;
  locale?: string;
}): Promise<ResetResult> {
  const isAr = input.locale !== 'en';

  if (input.password !== input.confirmPassword) {
    return { ok: false, error: isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match' };
  }

  const outcome = await completePasswordReset({
    token: String(input.token ?? ''),
    password: String(input.password ?? ''),
  });

  if (outcome.ok) return { ok: true };

  const message = MESSAGES[outcome.reason];
  return { ok: false, error: isAr ? message.ar : message.en };
}

'use server';

import { requestPasswordReset } from '@/lib/password-reset';
import { rateLimit, requestIp } from '@/lib/rate-limit';

export interface ForgotResult {
  ok: boolean;
  error?: string;
}

/**
 * Asking for a reset link.
 *
 * Always reports success. Telling the visitor "no account with that email"
 * turns this form into a way to find out who is registered — and on a platform
 * whose customers are named publicly in a coach directory, that is a list
 * somebody would want.
 *
 * Rate limited on both the address and the caller's IP: the first stops
 * someone flooding one person's inbox, the second stops one machine walking a
 * list of addresses.
 */
export async function sendResetLink(input: {
  email: string;
  locale?: string;
}): Promise<ForgotResult> {
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase();

  if (!email || !email.includes('@') || email.length > 160) {
    return { ok: false, error: 'اكتب بريد صحيح' };
  }

  const ip = await requestIp();
  const [byEmail, byIp] = await Promise.all([
    rateLimit('passwordReset', email),
    rateLimit('passwordResetIp', ip),
  ]);

  if (!byEmail.allowed || !byIp.allowed) {
    // Deliberately the same shape as success from the caller's point of view,
    // except for the message: an attacker learns only that they are being
    // throttled, not whether the address exists.
    return { ok: false, error: 'طلبت كتير في وقت قصير. استنى شوية وجرّب تاني.' };
  }

  try {
    await requestPasswordReset({ email, ip, locale: input.locale });
  } catch (error) {
    console.error('[forgot] failed to issue a reset link', error);
    // Still reported as success: whether this failed on our side is not
    // something the form should teach anyone about a given address.
  }

  return { ok: true };
}

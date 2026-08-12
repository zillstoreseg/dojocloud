import { z } from 'zod';
import type { Specialty } from '@prisma/client';
import { usernameSchema } from '@/lib/username';
import { SPECIALTY_KEYS } from '@/lib/specialties';

/**
 * Registration schema, shared by the client wizard and the server action.
 *
 * It lives outside `actions.ts` because a `'use server'` module may only
 * export async functions — the wizard needs the schema itself to validate a
 * step before letting the user move on.
 */

// Typed as a non-empty tuple of the Prisma enum so `specialties` infers as
// `Specialty[]` and goes straight into the create call without a cast.
const SPECIALTIES = SPECIALTY_KEYS as [Specialty, ...Specialty[]];

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(3, 'اكتب اسمك بالكامل').max(120),
    email: z.string().trim().toLowerCase().email('البريد الإلكتروني غير صحيح'),
    password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(128),
    confirmPassword: z.string(),
    phone: z.string().trim().min(7, 'رقم الهاتف غير صحيح').max(20),
    country: z.string().trim().min(2, 'اختر الدولة'),
    city: z.string().trim().max(80).optional().or(z.literal('')),
    gender: z.enum(['MALE', 'FEMALE'], { message: 'اختر النوع' }),
    trainsGenders: z.enum(['MALE', 'FEMALE', 'BOTH'], { message: 'اختر من تدرّبهم' }),
    yearsExperience: z.number().int().min(0, 'سنوات الخبرة غير صحيحة').max(60),
    specialties: z
      .array(z.enum(SPECIALTIES))
      .min(1, 'اختر تخصصًا واحدًا على الأقل')
      .max(6, 'اختر 6 تخصصات كحد أقصى'),
    username: usernameSchema,
    bio: z.string().trim().max(1000).optional().or(z.literal('')),
    /** Invite code from another coach. Prefilled from `?ref=` on the URL. */
    referralCode: z.string().trim().max(16).optional().or(z.literal('')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/** Which fields each wizard step owns, so a step validates only its own. */
export const STEP_FIELDS = [
  ['fullName', 'gender', 'email', 'password', 'confirmPassword'],
  ['specialties', 'yearsExperience', 'trainsGenders'],
  ['country', 'phone', 'city'],
  ['username', 'bio', 'referralCode'],
] as const satisfies readonly (readonly (keyof RegisterInput)[])[];

/**
 * Validates one step in isolation.
 *
 * `registerSchema` carries a `.refine` for password confirmation, and refines
 * do not survive `.pick()` — so the whole object is parsed and only the issues
 * belonging to this step are reported.
 */
export function validateStep(
  step: number,
  values: Partial<RegisterInput>,
): Record<string, string> {
  const fields = STEP_FIELDS[step] as readonly string[];
  const result = registerSchema.safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    if (fields.includes(field) && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

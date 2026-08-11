import { z } from 'zod';
import { prisma } from './prisma';

/**
 * Handles that must never be claimed by a trainer, because they collide with
 * app routes, static assets, or would be confusing/abusive as a public URL.
 */
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'billing', 'blog', 'c', 'cdn',
  'checkout', 'coach', 'coaches', 'contact', 'dash', 'dashboard', 'docs', 'en',
  'ar', 'faq', 'favicon', 'help', 'home', 'images', 'img', 'legal', 'login',
  'logout', 'me', 'my', 'new', 'news', 'null', 'undefined', 'onboarding',
  'pricing', 'privacy', 'public', 'register', 'reset', 'root', 'search',
  'settings', 'signin', 'signup', 'static', 'support', 'system', 'terms',
  'test', 'trainer', 'trainers', 'trainee', 'trainees', 'uploads', 'user',
  'users', 'www', 'assets', 'og', 'robots', 'sitemap', 'track', 'cron',
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'اسم المستخدم قصير جدًا (3 أحرف على الأقل)')
  .max(30, 'اسم المستخدم طويل جدًا (30 حرفًا كحد أقصى)')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'حروف إنجليزية صغيرة وأرقام وشرطة فقط، ولا يبدأ أو ينتهي بشرطة')
  .refine((v) => !v.includes('--'), 'لا يمكن استخدام شرطتين متتاليتين')
  .refine((v) => !RESERVED_USERNAMES.has(v), 'اسم المستخدم محجوز، جرّب اسمًا آخر');

/** How often a trainer may change their public handle. */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

/** Turns a full name into a candidate handle: "أحمد Fitness" → "ahmed-fitness". */
export function slugifyUsername(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 30);
  return base || 'coach';
}

/** True when the handle is free (not taken now, and not a retired handle). */
export async function isUsernameAvailable(username: string, excludeTrainerId?: string): Promise<boolean> {
  const value = username.toLowerCase();
  if (RESERVED_USERNAMES.has(value)) return false;

  const [taken, retired] = await Promise.all([
    prisma.trainerProfile.findUnique({ where: { username: value }, select: { id: true } }),
    prisma.usernameHistory.findUnique({ where: { username: value }, select: { trainerId: true } }),
  ]);

  if (taken && taken.id !== excludeTrainerId) return false;
  if (retired && retired.trainerId !== excludeTrainerId) return false;
  return true;
}

/** Finds a free handle near the requested one: ahmed → ahmed-2 → ahmed-3 … */
export async function suggestUsername(seed: string): Promise<string> {
  const base = slugifyUsername(seed);
  if (await isUsernameAvailable(base)) return base;
  for (let i = 2; i <= 50; i++) {
    const candidate = `${base.slice(0, 27)}-${i}`;
    if (await isUsernameAvailable(candidate)) return candidate;
  }
  return `${base.slice(0, 22)}-${Date.now().toString(36).slice(-6)}`;
}

/** Resolves a public handle to a trainer, following one retired-handle hop. */
export async function resolveUsername(username: string) {
  const value = username.toLowerCase();
  const trainer = await prisma.trainerProfile.findUnique({
    where: { username: value },
    select: { id: true, username: true },
  });
  if (trainer) return { trainerId: trainer.id, redirectTo: null as string | null };

  const historic = await prisma.usernameHistory.findUnique({
    where: { username: value },
    select: { trainer: { select: { id: true, username: true } } },
  });
  if (historic) {
    return { trainerId: historic.trainer.id, redirectTo: historic.trainer.username };
  }
  return null;
}

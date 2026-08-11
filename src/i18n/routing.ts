import { defineRouting } from 'next-intl/routing';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

export const localeDirection: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

export const localeLabels: Record<Locale, string> = {
  ar: 'العربية',
  en: 'English',
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Arabic is the default but still carries its prefix, so every URL is
  // explicit and shareable: /ar/c/ahmed and /en/c/ahmed both work.
  localePrefix: 'always',
});

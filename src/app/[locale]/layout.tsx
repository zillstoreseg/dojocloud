import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing, localeDirection, type Locale } from '@/i18n/routing';
import { getBrand } from '@/lib/settings';
import { display, body } from '@/lib/fonts';
import { SessionProvider } from '@/components/providers/session-provider';
import { Toaster } from '@/components/ui/toaster';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  const brand = await getBrand();
  const tagline = locale === 'ar' ? brand.taglineAr : brand.taglineEn;

  return {
    title: { default: `${brand.name} — ${tagline}`, template: `%s | ${brand.name}` },
    description: tagline || t('tagline'),
    // The icon comes from `src/app/icon.svg` via the file convention, so it
    // is fingerprinted and served without a 404 round trip.
    openGraph: {
      siteName: brand.name,
      locale: locale === 'ar' ? 'ar_EG' : 'en_US',
      type: 'website',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const brand = await getBrand();
  const dir = localeDirection[locale as Locale];

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable} font-sans`}
        // The admin's brand colours are applied as CSS variables so the whole
        // design system re-themes without a rebuild.
        style={{
          ['--primary' as string]: brand.primaryColor,
          ['--ring' as string]: brand.primaryColor,
          ['--brand-accent' as string]: brand.accentColor,
        }}
      >
        <SessionProvider>
          <NextIntlClientProvider>
            {/* Toaster owns the toast context, so it must wrap the tree. */}
            <Toaster>{children}</Toaster>
          </NextIntlClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

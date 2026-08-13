import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { formatDate } from '@/lib/money';
import { SiteFooter } from '@/components/site/footer';

/**
 * The platform's own pages: terms, privacy, about, FAQ.
 *
 * These exist as `StaticPage` rows so the owner edits them from the admin
 * panel without a deploy, and they are rendered here rather than hard-coded
 * because the terms of a service that collects health data, food photographs
 * and payments will change, and changing them should not require an engineer.
 */

export const revalidate = 300;

async function loadPage(slug: string) {
  return prisma.staticPage.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      slug: true,
      titleAr: true,
      titleEn: true,
      contentAr: true,
      contentEn: true,
      updatedAt: true,
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const [page, brand] = await Promise.all([loadPage(slug), getBrand()]);
  if (!page) return { title: 'Not found' };

  const title = locale === 'ar' ? page.titleAr : page.titleEn;
  return {
    title: `${title} — ${brand.name}`,
    // Legal text is not what anybody should find us by, and duplicated boilerplate
    // across a hundred coach sites is not something to invite crawlers into.
    robots: slug === 'terms' || slug === 'privacy' ? { index: false, follow: true } : undefined,
  };
}

export async function generateStaticParams() {
  const pages = await prisma.staticPage.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true },
  });
  return pages.flatMap((page) => [
    { locale: 'ar', slug: page.slug },
    { locale: 'en', slug: page.slug },
  ]);
}

export default async function StaticPageView({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = await loadPage(slug);
  if (!page) notFound();

  const isAr = locale === 'ar';
  const title = isAr ? page.titleAr : page.titleEn;
  const content = isAr ? page.contentAr : page.contentEn;

  return (
    <>
      <main className="relative min-h-screen">
        <div className="bg-contour pointer-events-none absolute inset-0 opacity-60" aria-hidden />

        <article className="relative mx-auto max-w-3xl px-4 py-16 md:py-24">
          <h1 className="font-display text-3xl font-bold md:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAr ? 'آخر تحديث: ' : 'Last updated: '}
            <span className="tabular-nums">{formatDate(page.updatedAt, locale)}</span>
          </p>

          {/*
            Rendered as text, deliberately.

            The content is admin-authored and would be safe enough as HTML, but
            an admin account is exactly the account an attacker would want, and
            injecting script into a page every visitor loads is what they would
            do with it. Paragraphs are enough for a policy.
          */}
          <div className="mt-8 space-y-4">
            {content
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line leading-loose text-foreground/90">
                  {paragraph}
                </p>
              ))}
          </div>
        </article>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}

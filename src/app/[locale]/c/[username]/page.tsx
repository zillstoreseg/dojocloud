import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { loadCoachPage, landingContext, themeStyle } from '@/lib/landing';
import { getBrand } from '@/lib/settings';
import { isFeatureEnabled, FLAG_KEYS } from '@/lib/flags';
import { trackPageView, utmFrom } from '@/lib/analytics';
import { specialtyLabel } from '@/lib/specialties';
import { countryLabel } from '@/lib/countries';
import { THEME_RADIUS } from '@/lib/page-blocks';
import { cn } from '@/lib/utils';
import { LandingBlock } from '@/components/landing/blocks';
import { LandingHeader } from '@/components/landing/header';
import { Logo } from '@/components/brand/logo';
import { Link } from '@/i18n/navigation';

type Params = Promise<{ locale: string; username: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * A coach's public landing page.
 *
 * Rendered on the server for SEO, and the only page in the product a
 * signed-out stranger is meant to land on from a search result or a shared
 * link — so it carries its own metadata, its own OG image, and its own
 * first-party view tracking.
 */

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, username } = await params;
  const data = await loadCoachPage(username);
  if (!data) return { title: 'Not found' };

  const isAr = locale === 'ar';
  const { coach, page } = data;
  const specialties = coach.specialties.map((s) => specialtyLabel(s, locale)).join('، ');
  const title = page?.seoTitle || `${coach.fullName} — ${specialties || (isAr ? 'مدرب شخصي' : 'Personal coach')}`;
  const description =
    page?.seoDescription ||
    coach.bio ||
    (isAr
      ? `درّب مع ${coach.fullName} في ${countryLabel(coach.country, locale)}: برنامج تدريب وتغذية مفصّل على هدفك.`
      : `Train with ${coach.fullName}: a plan built around your goal.`);

  const ogImage = page?.ogImageUrl || `/api/og?u=${encodeURIComponent(coach.username)}&locale=${locale}`;

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/c/${coach.username}`,
      languages: { ar: `/ar/c/${coach.username}`, en: `/en/c/${coach.username}` },
    },
    openGraph: {
      type: 'profile',
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      locale: isAr ? 'ar_EG' : 'en_US',
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
    robots: { index: true, follow: true },
  };
}

export default async function CoachPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { locale, username } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  // A changed username keeps its old handle resolvable rather than 404ing a
  // link the coach already printed on a flyer.
  const data = await loadCoachPage(username);
  if (!data) {
    const previous = await prisma.usernameHistory.findUnique({
      where: { username: username.toLowerCase() },
      select: { trainer: { select: { username: true } } },
    });
    if (previous?.trainer) redirect(`/${locale}/c/${previous.trainer.username}`);
    notFound();
  }

  const { coach, page, theme, blocks } = data;
  const isAr = locale === 'ar';
  const brand = await getBrand();

  // Removing the platform mark is a paid upgrade, so its absence is a feature
  // of the plan rather than something the coach can switch off.
  const canHideBadge = await isFeatureEnabled(coach.userId, FLAG_KEYS.BUILDER_REMOVE_BRANDING).catch(
    () => false,
  );

  await trackPageView({
    path: `/${locale}/c/${coach.username}`,
    trainerId: coach.id,
    pageId: page?.id ?? null,
    utm: utmFrom(sp),
  });

  if (page) {
    // Fire-and-forget: the counter is a convenience for the coach's dashboard,
    // and PageView is the real record.
    prisma.landingPage
      .update({ where: { id: page.id }, data: { viewsCount: { increment: 1 } } })
      .catch(() => {});
  }

  const ctx = landingContext({
    data,
    locale,
    pageId: page?.id ?? null,
    preview: false,
    showPoweredBy: !canHideBadge,
    brandName: brand.name,
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: coach.fullName,
    jobTitle: isAr ? 'مدرب شخصي' : 'Personal trainer',
    description: page?.seoDescription || coach.bio || undefined,
    image: coach.avatarUrl || undefined,
    address: { '@type': 'PostalAddress', addressCountry: coach.country },
    knowsAbout: coach.specialties.map((s) => specialtyLabel(s, locale)),
  };

  return (
    <div
      className={cn('min-h-dvh bg-background text-foreground', theme.mode === 'dark' && 'dark')}
      style={{ ...themeStyle(theme), '--radius': THEME_RADIUS[theme.radius] } as React.CSSProperties}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <LandingHeader
        name={coach.fullName}
        avatarUrl={coach.avatarUrl}
        username={coach.username}
        locale={locale}
        isAr={isAr}
        joinLabel={isAr ? 'اشترك معايا' : 'Subscribe'}
      />

      {blocks.length === 0 ? (
        <div className="bg-contour flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="font-display text-3xl font-bold">{coach.fullName}</h1>
          <p className="max-w-md text-muted-foreground">
            {isAr
              ? 'الصفحة دي لسه بتتجهّز.'
              : 'This page is still being put together.'}
          </p>
        </div>
      ) : (
        blocks.map((node) => <LandingBlock key={node.id} node={node} ctx={ctx} />)
      )}

      <footer className="border-t border-border/60 px-5 py-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 text-center">
          {ctx.showPoweredBy ? (
            <Link
              href="/"
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {isAr ? 'مدعوم من' : 'Powered by'}
              <Logo name={brand.name} className="text-sm" markClassName="size-5" />
            </Link>
          ) : null}
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {coach.fullName}
          </p>
        </div>
      </footer>
    </div>
  );
}

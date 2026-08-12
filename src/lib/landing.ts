import { cache } from 'react';
import { prisma } from './prisma';
import { decimalToNumber } from './money';
import { parseTheme, type PageTheme } from './page-blocks';
import type {
  LandingContext,
  LandingCoach,
  BlockNode,
} from '@/components/landing/context';

/**
 * Loads everything a public coach page renders, in one place.
 *
 * Used by the page itself, by `generateMetadata`, and by the OG image route —
 * `cache` keeps that to a single round trip per request rather than three.
 */

function socialLinksOf(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return out;
}

function featuresOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => typeof f === 'string').slice(0, 12);
}

export const loadCoachPage = cache(async (username: string) => {
  const handle = username.toLowerCase();

  const trainer = await prisma.trainerProfile.findFirst({
    where: { username: handle, approvalStatus: 'APPROVED' },
    include: {
      landingPages: {
        where: { status: 'PUBLISHED' },
        orderBy: [{ isDefault: 'desc' }, { publishedAt: 'desc' }],
        take: 1,
        include: { blocks: { where: { isVisible: true }, orderBy: { order: 'asc' } } },
      },
      certificates: {
        where: { status: 'APPROVED' },
        orderBy: [{ year: 'desc' }],
        take: 12,
      },
      packages: {
        where: { isActive: true, isPublic: true },
        orderBy: { sortOrder: 'asc' },
      },
      testimonials: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' }, take: 12 },
      transformations: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' }, take: 8 },
      _count: { select: { trainees: { where: { status: 'ACTIVE' } } } },
    },
  });

  if (!trainer) return null;

  const page = trainer.landingPages[0] ?? null;

  const coach: LandingCoach = {
    id: trainer.id,
    userId: trainer.userId,
    username: trainer.username,
    fullName: trainer.fullName,
    bio: trainer.bio,
    avatarUrl: trainer.avatarUrl,
    country: trainer.country,
    city: trainer.city,
    yearsExperience: trainer.yearsExperience,
    specialties: trainer.specialties,
    trainsGenders: trainer.trainsGenders,
    phone: trainer.phone,
    socialLinks: socialLinksOf(trainer.socialLinks),
    traineesCount: trainer._count.trainees,
  };

  return {
    coach,
    page,
    theme: parseTheme(page?.theme),
    blocks: (page?.blocks ?? []) as BlockNode[],
    packages: trainer.packages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: decimalToNumber(p.price),
      currency: p.currency,
      durationDays: p.durationDays,
      sessionsCount: p.sessionsCount,
      features: featuresOf(p.features),
    })),
    certificates: trainer.certificates.map((c) => ({
      id: c.id,
      title: c.title,
      issuer: c.issuer,
      year: c.year,
    })),
    testimonials: trainer.testimonials.map((t) => ({
      id: t.id,
      authorName: t.authorName,
      authorRole: t.authorRole,
      rating: t.rating,
      body: t.body,
    })),
    transformations: trainer.transformations.map((t) => ({
      id: t.id,
      title: t.title,
      beforeUrl: t.beforeUrl,
      afterUrl: t.afterUrl,
      story: t.story,
      durationWeeks: t.durationWeeks,
    })),
  };
});

export type CoachPageData = NonNullable<Awaited<ReturnType<typeof loadCoachPage>>>;

/** Builds the render context shared by the public page and the builder preview. */
export function landingContext(input: {
  data: Pick<
    CoachPageData,
    'coach' | 'packages' | 'certificates' | 'testimonials' | 'transformations'
  >;
  locale: string;
  pageId: string | null;
  preview: boolean;
  showPoweredBy: boolean;
  brandName: string;
}): LandingContext {
  return {
    locale: input.locale,
    isAr: input.locale === 'ar',
    coach: input.data.coach,
    packages: input.data.packages,
    certificates: input.data.certificates,
    testimonials: input.data.testimonials,
    transformations: input.data.transformations,
    pageId: input.pageId,
    preview: input.preview,
    showPoweredBy: input.showPoweredBy,
    brandName: input.brandName,
  };
}

/**
 * Theme as inline CSS variables.
 *
 * The coach picks a primary colour; everything else on the page is already
 * expressed against `--primary`, so one variable retints the whole page
 * without a second stylesheet.
 */
export function themeStyle(theme: PageTheme): React.CSSProperties {
  const style: Record<string, string> = {};
  if (theme.primary) style['--primary'] = theme.primary;
  return style as React.CSSProperties;
}

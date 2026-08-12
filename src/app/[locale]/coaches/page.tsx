import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, pageMeta } from '@/lib/list-params';
import { trackPageView, utmFrom } from '@/lib/analytics';
import { specialtyLabel, SPECIALTY_KEYS } from '@/lib/specialties';
import { COUNTRIES, countryLabel } from '@/lib/countries';
import { decimalToNumber } from '@/lib/money';
import { getBrand } from '@/lib/settings';
import { CoachDirectory, type DirectoryCoach } from './coach-directory';
import { DirectoryFilters } from './filters';
import { DataTablePagination } from '@/components/data-table/pagination';

type Params = Promise<{ locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The public coaches directory.
 *
 * This is the platform's own front door for search traffic: a visitor who has
 * never heard of any individual coach lands here, filters, and leaves as
 * somebody's subscriber. Every filter lives in the URL so a filtered view is
 * shareable and indexable, and every column it filters on is denormalised onto
 * `TrainerProfile` so the query stays a single indexed scan.
 */

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';
  const brand = await getBrand();
  const title = isAr ? `دليل المدربين — ${brand.name}` : `Find a coach — ${brand.name}`;
  const description = isAr
    ? 'اختر مدربك الشخصي: فلتر بالتخصص والدولة وسنوات الخبرة والسعر، وشوف شهاداته وعدد متدربيه قبل ما تشترك.'
    : 'Find your personal coach: filter by specialty, country, experience and price.';

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/coaches`, languages: { ar: '/ar/coaches', en: '/en/coaches' } },
    openGraph: { title, description, type: 'website' },
    robots: { index: true, follow: true },
  };
}

const SORTS = ['subscribers', 'rating', 'experience', 'newest', 'price'] as const;
type Sort = (typeof SORTS)[number];

export default async function CoachesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { defaultSort: 'subscribers', perPage: 12 });
  const f = listParams.filters;

  const one = (key: string): string => {
    const v = sp[key];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const many = (key: string) => {
    const v = sp[key];
    if (!v) return [];
    return (Array.isArray(v) ? v : v.split(',')).filter(Boolean);
  };

  const specialties = many('specialty');
  const minYears = Number(one('minYears')) || 0;
  const maxPrice = Number(one('maxPrice')) || 0;

  const where: Prisma.TrainerProfileWhereInput = {
    approvalStatus: 'APPROVED',
    isListed: true,
    ...(listParams.q
      ? {
          OR: [
            { fullName: { contains: listParams.q, mode: 'insensitive' as const } },
            { bio: { contains: listParams.q, mode: 'insensitive' as const } },
            { city: { contains: listParams.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(specialties.length ? { specialties: { hasSome: specialties as never } } : {}),
    ...(f.country ? { country: f.country } : {}),
    ...(f.trains ? { trainsGenders: { in: [f.trains, 'BOTH'] as never } } : {}),
    ...(f.gender ? { gender: f.gender as never } : {}),
    ...(minYears ? { yearsExperience: { gte: minYears } } : {}),
    ...(f.certified === 'yes' ? { approvedCertificatesCount: { gt: 0 } } : {}),
    ...(maxPrice ? { startingPrice: { lte: maxPrice, not: null } } : {}),
  };

  // Featured placement is paid, so it wins on every ordering — but only while
  // it is actually paid for, which is what the date check below enforces.
  const sort: Sort = (SORTS as readonly string[]).includes(listParams.sort ?? '')
    ? (listParams.sort as Sort)
    : 'subscribers';

  const orderBy: Prisma.TrainerProfileOrderByWithRelationInput[] = [
    { isFeatured: 'desc' },
    ...(sort === 'rating'
      ? [{ ratingAvg: 'desc' as const }, { ratingCount: 'desc' as const }]
      : sort === 'experience'
        ? [{ yearsExperience: 'desc' as const }]
        : sort === 'newest'
          ? [{ createdAt: 'desc' as const }]
          : sort === 'price'
            ? [{ startingPrice: 'asc' as const }]
            : [{ activeTraineesCount: 'desc' as const }]),
    { createdAt: 'desc' },
  ];

  const [total, rows, countries] = await Promise.all([
    prisma.trainerProfile.count({ where }),
    prisma.trainerProfile.findMany({
      where,
      orderBy,
      ...paginationArgs(listParams),
      select: {
        id: true,
        username: true,
        fullName: true,
        bio: true,
        avatarUrl: true,
        country: true,
        city: true,
        gender: true,
        trainsGenders: true,
        yearsExperience: true,
        specialties: true,
        isFeatured: true,
        featuredUntil: true,
        activeTraineesCount: true,
        approvedCertificatesCount: true,
        ratingAvg: true,
        ratingCount: true,
        startingPrice: true,
        startingCurrency: true,
      },
    }),
    // Only offer countries that actually have a listed coach; an empty filter
    // option is a dead end the visitor has to discover by clicking it.
    prisma.trainerProfile.findMany({
      where: { approvalStatus: 'APPROVED', isListed: true },
      distinct: ['country'],
      select: { country: true },
    }),
  ]);

  await trackPageView({ path: `/${locale}/coaches`, utm: utmFrom(sp) });

  const now = Date.now();
  const coaches: DirectoryCoach[] = rows.map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    countryLabel: countryLabel(row.country, locale),
    city: row.city,
    yearsExperience: row.yearsExperience,
    specialties: row.specialties.map((s) => specialtyLabel(s, locale)),
    trainsGenders: row.trainsGenders,
    // A featured slot that has expired is just an ordinary listing again.
    isFeatured: row.isFeatured && (!row.featuredUntil || row.featuredUntil.getTime() > now),
    traineesCount: row.activeTraineesCount,
    certificatesCount: row.approvedCertificatesCount,
    rating: row.ratingAvg ? decimalToNumber(row.ratingAvg) : null,
    ratingCount: row.ratingCount,
    startingPrice: row.startingPrice ? decimalToNumber(row.startingPrice) : null,
    startingCurrency: row.startingCurrency,
  }));

  const meta = pageMeta(listParams, total);

  return (
    <main className="min-h-dvh">
      <section className="bg-contour border-b border-border/60 px-5 py-14 md:py-20">
        <div className="mx-auto w-full max-w-5xl space-y-3 text-center">
          <p className="eyebrow">{isAr ? 'دليل المدربين' : 'Coach directory'}</p>
          <h1 className="font-display text-3xl font-bold md:text-5xl">
            {isAr ? 'لاقي المدرب اللي يفهم هدفك' : 'Find a coach who gets your goal'}
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {isAr
              ? 'كل مدرب هنا معتمد من الإدارة وشهاداته متراجَعة. فلتر بالتخصص والدولة والخبرة والسعر.'
              : 'Every coach here is reviewed and approved. Filter by specialty, country, experience and price.'}
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8">
        <DirectoryFilters
          isAr={isAr}
          locale={locale}
          total={total}
          specialtyOptions={SPECIALTY_KEYS.map((value) => ({
            value,
            label: specialtyLabel(value, locale),
          }))}
          countryOptions={COUNTRIES.filter((c) =>
            countries.some((row) => row.country === c.code),
          ).map((c) => ({ value: c.code, label: isAr ? c.ar : c.en }))}
        />

        <CoachDirectory coaches={coaches} locale={locale} isAr={isAr} />

        <DataTablePagination meta={meta} />
      </div>
    </main>
  );
}

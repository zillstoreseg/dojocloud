import { setRequestLocale } from 'next-intl/server';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { isFeatureEnabled, FLAG_KEYS } from '@/lib/flags';
import { loadCoachPage, landingContext } from '@/lib/landing';
import { parseTheme, BLOCK_ORDER, FLAGGED_BLOCKS } from '@/lib/page-blocks';
import { decimalToNumber } from '@/lib/money';
import { TrainerPage } from '@/components/trainer/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { PageBuilder } from './page-builder';
import { CreatePageButton } from './create-page-button';
import type { BlockNode } from '@/components/landing/context';

/**
 * The page builder.
 *
 * The preview is not a mock: it renders the same block components the public
 * page does, against the coach's real packages and certificates. What they see
 * while editing is what a visitor gets, which is the only version of a builder
 * worth shipping.
 */
export default async function PageBuilderRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const [page, profile, brand, canCustomHtml] = await Promise.all([
    prisma.landingPage.findFirst({
      where: { trainerId: user.trainerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { blocks: { orderBy: { order: 'asc' } } },
    }),
    prisma.trainerProfile.findUniqueOrThrow({
      where: { id: user.trainerId },
      select: { username: true, fullName: true },
    }),
    getBrand(),
    isFeatureEnabled(user.id, FLAG_KEYS.BUILDER_CUSTOM_HTML).catch(() => false),
  ]);

  if (!page) {
    return (
      <TrainerPage
        title={isAr ? 'صفحتي' : 'My page'}
        description={
          isAr
            ? 'صفحة عامة على رابطك الخاص، تبني بيها حضورك وتجيب بيها مشتركين.'
            : 'A public page on your own link that brings you subscribers.'
        }
      >
        <EmptyState
          title={isAr ? 'لسه مبنيتش صفحتك' : 'You have not built your page yet'}
          description={
            isAr
              ? `هنجهّزلك صفحة مبدئية على coachmate.app/c/${profile.username} وتعدّل عليها زي ما تحب.`
              : `We will set up a starter page at /c/${profile.username} for you to edit.`
          }
          action={<CreatePageButton isAr={isAr} />}
        />
      </TrainerPage>
    );
  }

  // The preview needs the same context the public page builds, so it is loaded
  // through the same loader rather than a second, drift-prone query.
  const live = await loadCoachPage(profile.username);
  const ctx = landingContext({
    data: live ?? {
      coach: {
        id: user.trainerId,
        userId: user.id,
        username: profile.username,
        fullName: profile.fullName,
        bio: null,
        avatarUrl: null,
        country: 'EG',
        city: null,
        yearsExperience: 0,
        specialties: [],
        trainsGenders: 'BOTH',
        phone: '',
        socialLinks: {},
        traineesCount: 0,
      },
      packages: [],
      certificates: [],
      testimonials: [],
      transformations: [],
    },
    locale,
    pageId: null,
    preview: true,
    showPoweredBy: true,
    brandName: brand.name,
  });

  const packages = await prisma.trainerPackage.findMany({
    where: { trainerId: user.trainerId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, price: true, currency: true },
  });

  const available = BLOCK_ORDER.filter(
    (type) => !FLAGGED_BLOCKS[type] || canCustomHtml,
  );

  return (
    <TrainerPage
      title={isAr ? 'صفحتي' : 'My page'}
      actions={
        <Button variant="outline" asChild>
          <a href={`/${locale}/c/${profile.username}`} target="_blank" rel="noopener noreferrer">
            {isAr ? 'افتح الصفحة' : 'Open page'}
          </a>
        </Button>
      }
      className="p-0 md:p-0"
    >
      <PageBuilder
        locale={locale}
        page={{
          id: page.id,
          title: page.title,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          status: page.status,
          username: profile.username,
          viewsCount: page.viewsCount,
          leadsCount: page.leadsCount,
        }}
        theme={parseTheme(page.theme)}
        blocks={page.blocks as BlockNode[]}
        ctx={ctx}
        available={available}
        packages={packages.map((p) => ({
          id: p.id,
          label: `${p.name} — ${decimalToNumber(p.price)} ${p.currency}`,
        }))}
      />
    </TrainerPage>
  );
}

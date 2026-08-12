import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { requireTraineePage, dayBudget } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/money';
import type { FoodScanItem } from '@/lib/ai/food-scan';
import { ScanStudio, type ScanCard } from './scan-studio';
import { scanAllowance } from './actions';

export default async function ScanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const [allowance, budget, scans] = await Promise.all([
    scanAllowance(),
    dayBudget(ctx),
    prisma.foodScan.findMany({
      where: { traineeId: ctx.traineeId, status: 'DONE' },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ]);

  const cards: ScanCard[] = scans.map((scan) => ({
    id: scan.id,
    title: scan.title,
    imageUrl: scan.imageUrl,
    thumbUrl: scan.thumbUrl,
    items: (scan.items as unknown as FoodScanItem[]) ?? [],
    kcal: scan.kcal ?? 0,
    protein: scan.protein ?? 0,
    carbs: scan.carbs ?? 0,
    fat: scan.fat ?? 0,
    confidence: scan.confidence ? Number(scan.confidence) : 0,
    verdict: scan.verdict ?? 'FITS',
    reason: (isAr ? scan.verdictReasonAr : scan.verdictReasonEn) ?? '',
    logged: Boolean(scan.loggedAt),
    reported: Boolean(scan.reportedAt),
    createdAt: formatDateTime(scan.createdAt, locale),
  }));

  if (!allowance.enabled) {
    return (
      <TraineePage title={isAr ? 'صوّر وجبتك' : 'Scan a meal'}>
        <EmptyState
          title={isAr ? 'الميزة دي مش مفعّلة' : 'Not available yet'}
          description={
            isAr
              ? 'تحليل صور الوجبات جزء من باقة مدربك. كلّمه لو حابب تستخدمها.'
              : 'Meal scanning is part of your coach’s plan. Ask them to enable it.'
          }
        />
      </TraineePage>
    );
  }

  return (
    <TraineePage
      title={isAr ? 'صوّر وجبتك' : 'Scan a meal'}
      description={
        isAr
          ? 'صوّر الطبق قبل ما تاكل، وهنقولك سعراته وماكروزه — والحكم محسوب على هدفك أنت.'
          : 'Photograph the plate before you eat. We read its calories and macros, and judge them against your own goal.'
      }
    >
      <ScanStudio
        locale={locale}
        allowance={allowance}
        budget={{
          target: budget.target,
          consumed: budget.consumed,
          remaining: budget.remaining,
          source: budget.source,
        }}
        scans={cards}
      />
    </TraineePage>
  );
}

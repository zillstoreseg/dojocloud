import { setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import type { Prisma } from '@prisma/client';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, pageMeta } from '@/lib/list-params';
import { AdminPage } from '@/components/admin/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination } from '@/components/data-table/pagination';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, formatNumber } from '@/lib/money';
import { VERDICT_LABELS } from '@/lib/verdict';
import type { FoodScanItem } from '@/lib/ai/food-scan';

const STATUS_FILTER = [
  { value: 'DONE', labelAr: 'ناجح', labelEn: 'Done' },
  { value: 'FAILED', labelAr: 'فاشل', labelEn: 'Failed' },
  { value: 'PENDING', labelAr: 'معلّق', labelEn: 'Pending' },
];

/**
 * The admin's window onto meal scanning.
 *
 * A vision model that reads plates wrongly does not announce itself — the
 * trainee just quietly stops trusting the number. So the three figures that
 * matter lead the screen: how often it fails, how often a trainee says the
 * reading was wrong, and what it costs. A rising report rate is the signal to
 * change the prompt, and it is only visible if it is counted.
 */
export default async function AdminFoodScansPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('analytics.ai', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { defaultSort: 'createdAt' });

  const where: Prisma.FoodScanWhereInput = {
    ...(listParams.filters.status ? { status: listParams.filters.status as never } : {}),
    ...(listParams.filters.reported === 'yes' ? { reportedAt: { not: null } } : {}),
  };

  const [total, rows, counts, reported, cost] = await Promise.all([
    prisma.foodScan.count({ where }),
    prisma.foodScan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginationArgs(listParams),
      include: {
        trainee: { select: { fullName: true, trainer: { select: { fullName: true } } } },
      },
    }),
    prisma.foodScan.groupBy({ by: ['status'], _count: true }),
    prisma.foodScan.count({ where: { reportedAt: { not: null } } }),
    prisma.aiUsage.aggregate({ where: { feature: 'food_scan' }, _sum: { costUsd: true } }),
  ]);

  const meta = pageMeta(listParams, total);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const allScans = counts.reduce((sum, c) => sum + c._count, 0);
  const failed = byStatus.FAILED ?? 0;
  const done = byStatus.DONE ?? 0;

  const cards = [
    { label: isAr ? 'إجمالي التحليلات' : 'Total scans', value: formatNumber(allScans, locale) },
    {
      label: isAr ? 'معدل الفشل' : 'Failure rate',
      value: allScans ? `${Math.round((failed / allScans) * 100)}%` : '—',
      tone: failed / Math.max(1, allScans) > 0.1 ? 'warning' : undefined,
    },
    {
      label: isAr ? 'بلاغات «التحليل غلط»' : 'Reported as wrong',
      value: done ? `${Math.round((reported / done) * 100)}%` : '—',
      tone: reported / Math.max(1, done) > 0.15 ? 'warning' : undefined,
    },
    {
      label: isAr ? 'التكلفة الإجمالية' : 'Total cost',
      value: `$${Number(cost._sum.costUsd ?? 0).toFixed(2)}`,
      tone: 'primary',
    },
  ];

  return (
    <AdminPage
      title={isAr ? 'تحليلات صور الأكل' : 'Food scans'}
      description={
        isAr
          ? 'عيّنة من كل تحليل، ومعدل الفشل والبلاغات والتكلفة. البلاغات المتصاعدة معناها إن الـ prompt محتاج مراجعة.'
          : 'A sample of every reading, with failure, report and cost rates. A rising report rate means the prompt needs work.'
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p
                className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                  card.tone === 'primary'
                    ? 'text-primary'
                    : card.tone === 'warning'
                      ? 'text-warning'
                      : ''
                }`}
              >
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTableToolbar
        filters={[
          {
            key: 'status',
            label: isAr ? 'الحالة' : 'Status',
            options: STATUS_FILTER.map((s) => ({
              value: s.value,
              label: isAr ? s.labelAr : s.labelEn,
            })),
          },
          {
            key: 'reported',
            label: isAr ? 'المبلَّغ عنها' : 'Reported',
            options: [{ value: 'yes', label: isAr ? 'المبلَّغ عنها فقط' : 'Reported only' }],
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={isAr ? 'مفيش تحليلات لسه' : 'No scans yet'}
          description={
            isAr
              ? 'أول ما متدرب يصوّر وجبته هتظهر هنا بالنتيجة والتكلفة.'
              : 'The first meal a trainee photographs shows up here with its reading and cost.'
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((scan) => {
            const items = (scan.items as unknown as FoodScanItem[]) ?? [];
            return (
              <Card key={scan.id} className={scan.reportedAt ? 'border-warning/50' : ''}>
                <CardContent className="flex gap-4 p-4">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={scan.thumbUrl ?? scan.imageUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {scan.title ?? (isAr ? 'بدون عنوان' : 'Untitled')}
                      </p>
                      {scan.status === 'FAILED' ? (
                        <Badge variant="destructive">{isAr ? 'فشل' : 'Failed'}</Badge>
                      ) : scan.verdict ? (
                        <Badge variant={scan.verdict === 'FITS' ? 'success' : 'warning'}>
                          {VERDICT_LABELS[scan.verdict][isAr ? 'ar' : 'en']}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="truncate text-xs text-muted-foreground">
                      {scan.trainee.fullName} · {scan.trainee.trainer.fullName}
                    </p>

                    {scan.status === 'DONE' ? (
                      <p className="text-xs tabular-nums">
                        {scan.kcal} {isAr ? 'سعر' : 'kcal'} · {items.length}{' '}
                        {isAr ? 'صنف' : 'items'} ·{' '}
                        {isAr ? 'ثقة' : 'conf'} {Math.round(Number(scan.confidence ?? 0) * 100)}%
                      </p>
                    ) : scan.errorMessage ? (
                      <p className="truncate text-xs text-destructive" dir="ltr">
                        {scan.errorMessage}
                      </p>
                    ) : null}

                    <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {formatDateTime(scan.createdAt, locale)}
                    </p>

                    {scan.reportedAt ? (
                      <Badge variant="warning">{isAr ? 'المتدرب قال إنه غلط' : 'Reported wrong'}</Badge>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DataTablePagination meta={meta} />
    </AdminPage>
  );
}

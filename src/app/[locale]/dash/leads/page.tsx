import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, orderByArgs, pageMeta } from '@/lib/list-params';
import { TrainerPage } from '@/components/trainer/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination } from '@/components/data-table/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { StatRing } from '@/components/ui/stat-ring';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber, formatDate } from '@/lib/money';
import { LeadList, type LeadRow } from './lead-list';

const SORTABLE = ['createdAt', 'name', 'status'] as const;

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  NEW: { ar: 'جديد', en: 'New' },
  CONTACTED: { ar: 'اتواصلت معاه', en: 'Contacted' },
  CONVERTED: { ar: 'بقى متدرب', en: 'Converted' },
  LOST: { ar: 'ضاع', en: 'Lost' },
};

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { defaultSort: 'createdAt' });

  const where: Prisma.LeadWhereInput = {
    trainerId: user.trainerId,
    ...(listParams.q
      ? {
          OR: [
            { name: { contains: listParams.q, mode: 'insensitive' as const } },
            { phone: { contains: listParams.q } },
          ],
        }
      : {}),
    ...(listParams.filters.status ? { status: listParams.filters.status as never } : {}),
  };

  const [total, rows, counts, pageViews] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: orderByArgs(listParams, SORTABLE),
      ...paginationArgs(listParams),
    }),
    prisma.lead.groupBy({
      by: ['status'],
      where: { trainerId: user.trainerId },
      _count: true,
    }),
    prisma.pageView.count({ where: { trainerId: user.trainerId, isBot: false } }),
  ]);

  const meta = pageMeta(listParams, total);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const allLeads = counts.reduce((sum, c) => sum + c._count, 0);
  const converted = byStatus.CONVERTED ?? 0;

  // The funnel is the point of the landing page, so it leads the screen rather
  // than hiding at the bottom of a table.
  const visitToLead = pageViews > 0 ? allLeads / pageViews : 0;
  const leadToTrainee = allLeads > 0 ? converted / allLeads : 0;

  const leadRows: LeadRow[] = rows.map((lead) => ({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    goal: lead.goal,
    message: lead.message,
    note: lead.note,
    status: lead.status,
    source: lead.source,
    convertedTraineeId: lead.convertedTraineeId,
    createdAt: formatDate(lead.createdAt, locale),
  }));

  return (
    <TrainerPage
      title={isAr ? 'العملاء المحتملون' : 'Leads'}
      description={
        isAr
          ? 'كل من ساب رقمه على صفحتك. حوّله لمتدرب بضغطة.'
          : 'Everyone who left their number on your page.'
      }
    >
      <Card>
        <CardContent className="flex flex-wrap items-center gap-8 p-6">
          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'زيارات الصفحة' : 'Page views'}</p>
            <p className="font-display text-3xl font-semibold tabular-nums">
              {formatNumber(pageViews, locale)}
            </p>
          </div>
          <StatRing
            value={visitToLead}
            size={76}
            tone="primary"
            label={isAr ? 'زائر ← عميل' : 'Visit → lead'}
          >
            <span className="text-xs tabular-nums">{Math.round(visitToLead * 100)}%</span>
          </StatRing>
          <StatRing
            value={leadToTrainee}
            size={76}
            tone="brand"
            label={isAr ? 'عميل ← متدرب' : 'Lead → trainee'}
          >
            <span className="text-xs tabular-nums">{Math.round(leadToTrainee * 100)}%</span>
          </StatRing>
          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'جدد' : 'New'}</p>
            <p className="font-display text-3xl font-semibold tabular-nums text-primary">
              {formatNumber(byStatus.NEW ?? 0, locale)}
            </p>
          </div>
        </CardContent>
      </Card>

      <DataTableToolbar
        searchPlaceholder={isAr ? 'ابحث بالاسم أو الهاتف' : 'Search by name or phone'}
        filters={[
          {
            key: 'status',
            label: isAr ? 'الحالة' : 'Status',
            options: Object.entries(STATUS_LABELS).map(([value, label]) => ({
              value,
              label: label[isAr ? 'ar' : 'en'],
            })),
          },
        ]}
      />

      {leadRows.length === 0 ? (
        <EmptyState
          title={isAr ? 'لسه مفيش عملاء محتملين' : 'No leads yet'}
          description={
            isAr
              ? 'انشر صفحتك وشاركها؛ كل من يملأ نموذج التواصل هيظهر هنا.'
              : 'Publish and share your page — every contact form submission lands here.'
          }
        />
      ) : (
        <LeadList
          rows={leadRows}
          locale={locale}
          statusLabels={Object.fromEntries(
            Object.entries(STATUS_LABELS).map(([k, v]) => [k, v[isAr ? 'ar' : 'en']]),
          )}
        />
      )}

      <DataTablePagination meta={meta} />
    </TrainerPage>
  );
}

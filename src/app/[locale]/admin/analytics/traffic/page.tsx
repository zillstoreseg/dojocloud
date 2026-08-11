import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { parseListParams } from '@/lib/admin/query';
import { getTrafficStats, getFunnel, rangeOrDefault } from '@/lib/admin/analytics';
import { AdminPage, AdminSection } from '@/components/admin/page-shell';
import { StatCard, FunnelStep } from '@/components/admin/stat-card';
import { TimeSeriesChart } from '@/components/charts/charts';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/money';
import { Link } from '@/i18n/navigation';

export default async function TrafficPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('analytics.traffic', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp);
  const range = rangeOrDefault(listParams.from, listParams.to, 30);

  const [traffic, funnel] = await Promise.all([getTrafficStats(range), getFunnel(range)]);
  const maxFunnel = Math.max(funnel.visitors, 1);
  const n = (v: number) => formatNumber(v, locale);

  const listCard = (
    title: string,
    rows: Array<{ label: string; value: number }>,
    emptyText: string,
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={2}>{emptyText}</TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="max-w-64 truncate text-sm" dir="ltr">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">{n(row.value)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <AdminPage
      title={isAr ? 'الزوار' : 'Traffic'}
      description={
        isAr
          ? 'تتبّع داخلي بالكامل — بدون خدمات خارجية وبدون كوكيز طرف ثالث.'
          : 'Fully first-party tracking — no external services, no third-party cookies.'
      }
    >
      <DataTableToolbar showDateRange searchPlaceholder={isAr ? 'بحث' : 'Search'} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isAr ? 'مشاهدات الصفحات' : 'Page views'} value={n(traffic.views)} />
        <StatCard label={isAr ? 'الجلسات' : 'Sessions'} value={n(traffic.sessions)} />
        <StatCard label={isAr ? 'عملاء محتملون' : 'Leads'} value={n(traffic.leads)} />
        <StatCard
          label={isAr ? 'تحوّلوا لمتدربين' : 'Converted'}
          value={n(traffic.conversions)}
          sublabel={isAr ? `${funnel.traineeRate}% من العملاء المحتملين` : `${funnel.traineeRate}% of leads`}
        />
      </div>

      <AdminSection title={isAr ? 'الزيارات والجلسات يوميًا' : 'Daily views and sessions'}>
        <Card>
          <CardContent className="pt-6">
            <TimeSeriesChart
              data={traffic.series}
              series={[
                { key: 'views', label: isAr ? 'مشاهدات' : 'Views', slot: 0 },
                { key: 'sessions', label: isAr ? 'جلسات' : 'Sessions', slot: 1 },
              ]}
            />
          </CardContent>
        </Card>
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'قمع التحويل' : 'Conversion funnel'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FunnelStep slot={0} label={isAr ? 'زائر' : 'Visitor'} value={n(funnel.visitors)} widthPercent={100} />
            <FunnelStep
              slot={1}
              label={isAr ? 'عميل محتمل' : 'Lead'}
              value={n(funnel.leads)}
              rate={funnel.leadRate}
              rateLabel={isAr ? 'من الزوار' : 'of visitors'}
              widthPercent={(funnel.leads / maxFunnel) * 100}
            />
            <FunnelStep
              slot={2}
              label={isAr ? 'تحوّل لمتدرب' : 'Converted'}
              value={n(funnel.trainees)}
              rate={funnel.traineeRate}
              rateLabel={isAr ? 'من العملاء المحتملين' : 'of leads'}
              widthPercent={(funnel.trainees / maxFunnel) * 100}
            />
            <FunnelStep
              slot={3}
              label={isAr ? 'متدرب مدفوع' : 'Paying trainee'}
              value={n(funnel.paidTrainees)}
              rate={funnel.paidRate}
              rateLabel={isAr ? 'من المتحوّلين' : 'of converted'}
              widthPercent={(funnel.paidTrainees / maxFunnel) * 100}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? 'أفضل صفحات المدربين' : 'Top trainer pages'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'المدرب' : 'Trainer'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'زيارات' : 'Views'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'عملاء' : 'Leads'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'التحويل' : 'Conv.'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traffic.topTrainerPages.length === 0 ? (
                  <TableEmpty colSpan={4}>{isAr ? 'لا توجد زيارات بعد' : 'No visits yet'}</TableEmpty>
                ) : (
                  traffic.topTrainerPages.map((row) => (
                    <TableRow key={row.trainerId}>
                      <TableCell>
                        <Link
                          href={`/c/${row.username}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          /c/{row.username}
                        </span>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{n(row.views)}</TableCell>
                      <TableCell className="text-end tabular-nums">{n(row.leads)}</TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {row.views > 0 ? `${Math.round((row.leads / row.views) * 1000) / 10}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        {listCard(
          isAr ? 'أهم المصادر' : 'Top sources',
          traffic.topSources.map((s) => ({ label: s.source, value: s.views })),
          isAr ? 'لا بيانات' : 'No data',
        )}
        {listCard(
          isAr ? 'أكثر الصفحات' : 'Top pages',
          traffic.topPages.map((p) => ({ label: p.path, value: p.views })),
          isAr ? 'لا بيانات' : 'No data',
        )}
        {listCard(
          isAr ? 'الدول' : 'Countries',
          traffic.byCountry.map((c) => ({ label: c.country, value: c.views })),
          isAr ? 'لا بيانات' : 'No data',
        )}
        {listCard(
          isAr ? 'الأجهزة' : 'Devices',
          traffic.byDevice.map((d) => ({ label: d.device, value: d.views })),
          isAr ? 'لا بيانات' : 'No data',
        )}
      </div>
    </AdminPage>
  );
}

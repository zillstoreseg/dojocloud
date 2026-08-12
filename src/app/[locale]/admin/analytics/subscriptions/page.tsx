import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { parseListParams } from '@/lib/list-params';
import { getSubscriptionStats, getOverviewStats, rangeOrDefault } from '@/lib/admin/analytics';
import { AdminPage, AdminSection } from '@/components/admin/page-shell';
import { StatCard } from '@/components/admin/stat-card';
import { TimeSeriesChart, CategoryBarChart } from '@/components/charts/charts';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { formatNumber } from '@/lib/money';

export default async function SubscriptionAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('analytics.revenue', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp);
  const range = rangeOrDefault(listParams.from, listParams.to, 30);

  const [stats, overview] = await Promise.all([getSubscriptionStats(range), getOverviewStats(range)]);
  const n = (v: number) => formatNumber(v, locale);

  return (
    <AdminPage
      title={isAr ? 'الاشتراكات' : 'Subscriptions'}
      description={isAr ? 'النمو والإلغاء وتوزيع الخطط' : 'Growth, churn and plan distribution'}
    >
      <DataTableToolbar showDateRange exportEntity="subscriptions" searchPlaceholder={isAr ? 'بحث' : 'Search'} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isAr ? 'اشتراكات نشطة' : 'Active'} value={n(overview.activeSubscriptions)} />
        <StatCard label={isAr ? 'تجارب جارية' : 'Trialing'} value={n(overview.trialingSubscriptions)} />
        <StatCard label={isAr ? 'اشتراكات جديدة' : 'New'} value={n(overview.newSubscriptions)} change={overview.newSubscriptionsChange} />
        <StatCard label={isAr ? 'معدل الإلغاء' : 'Churn'} value={`${overview.churnRate}%`} invert />
      </div>

      <AdminSection title={isAr ? 'الجديد مقابل الملغى' : 'New vs. churned'}>
        <Card>
          <CardContent className="pt-6">
            <TimeSeriesChart
              data={stats.series}
              series={[
                { key: 'created', label: isAr ? 'جديد' : 'New', slot: 0 },
                { key: 'canceled', label: isAr ? 'ملغى' : 'Churned', slot: 2 },
              ]}
            />
          </CardContent>
        </Card>
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'المشتركون حسب الخطة' : 'Subscribers by plan'}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byPlan.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{isAr ? 'لا بيانات' : 'No data'}</p>
            ) : (
              <CategoryBarChart
                horizontal
                height={Math.max(200, stats.byPlan.length * 44)}
                data={stats.byPlan.map((p) => ({ name: isAr ? p.nameAr : p.nameEn, count: p.count }))}
                series={[{ key: 'count', label: isAr ? 'مشتركون' : 'Subscribers', slot: 0 }]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'حسب الحالة' : 'By status'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'العدد' : 'Count'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byStatus.length === 0 ? (
                  <TableEmpty colSpan={2}>{isAr ? 'لا بيانات' : 'No data'}</TableEmpty>
                ) : (
                  stats.byStatus.map((row) => (
                    <TableRow key={row.status}>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{n(row.count)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminPage>
  );
}

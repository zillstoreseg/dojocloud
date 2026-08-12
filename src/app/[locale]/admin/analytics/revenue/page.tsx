import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { countryLabel } from '@/lib/countries';
import { parseListParams } from '@/lib/list-params';
import { getRevenueSeries, getRevenueBreakdown, getOverviewStats, rangeOrDefault } from '@/lib/admin/analytics';
import { AdminPage, AdminSection } from '@/components/admin/page-shell';
import { StatCard } from '@/components/admin/stat-card';
import { TimeSeriesChart, CategoryBarChart } from '@/components/charts/charts';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/money';

const usd = (v: number, locale: string, digits = 0) =>
  `$${v.toLocaleString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { maximumFractionDigits: digits })}`;

export default async function RevenuePage({
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

  const [series, breakdown, overview] = await Promise.all([
    getRevenueSeries(range),
    getRevenueBreakdown(range),
    getOverviewStats(range),
  ]);

  return (
    <AdminPage
      title={isAr ? 'الإيرادات' : 'Revenue'}
      description={isAr ? 'المدفوعات المعتمدة خلال الفترة المحددة' : 'Approved payments in the selected period'}
    >
      <DataTableToolbar showDateRange exportEntity="payments" searchPlaceholder={isAr ? 'بحث' : 'Search'} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isAr ? 'إيراد الفترة' : 'Period revenue'} value={usd(overview.revenueUsd, locale)} change={overview.revenueChange} />
        <StatCard label={isAr ? 'الإيراد الشهري المتكرر' : 'MRR'} value={usd(overview.mrrUsd, locale)} />
        <StatCard label={isAr ? 'الإيراد السنوي المتوقع' : 'ARR'} value={usd(overview.arrUsd, locale)} />
        <StatCard label={isAr ? 'متوسط الإيراد لكل مدرب' : 'ARPU'} value={usd(overview.arpuUsd, locale, 2)} />
      </div>

      <AdminSection title={isAr ? 'الإيراد اليومي' : 'Daily revenue'}>
        <Card>
          <CardContent className="pt-6">
            <TimeSeriesChart
              data={series}
              area
              series={[{ key: 'revenue', label: isAr ? 'الإيراد (دولار)' : 'Revenue (USD)', slot: 0, format: 'money' }]}
            />
          </CardContent>
        </Card>
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'الإيراد حسب الخطة' : 'Revenue by plan'}</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.byPlan.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{isAr ? 'لا بيانات' : 'No data'}</p>
            ) : (
              <CategoryBarChart
                horizontal
                height={Math.max(200, breakdown.byPlan.length * 44)}
                data={breakdown.byPlan.map((p) => ({ name: isAr ? p.nameAr : p.nameEn, revenue: p.revenue }))}
                series={[{ key: 'revenue', label: isAr ? 'الإيراد' : 'Revenue', slot: 0, format: 'money' }]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'حسب العملة' : 'By currency'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'العملة' : 'Currency'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'المبلغ' : 'Amount'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.byCurrency.length === 0 ? (
                  <TableEmpty colSpan={2}>{isAr ? 'لا بيانات' : 'No data'}</TableEmpty>
                ) : (
                  breakdown.byCurrency.map((row) => (
                    <TableRow key={row.currency}>
                      <TableCell className="font-medium">{row.currency}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatMoney(row.amount, row.currency, locale)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'حسب طريقة الدفع' : 'By payment method'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {breakdown.byMethod.length === 0 ? (
                  <TableEmpty colSpan={2}>{isAr ? 'لا بيانات' : 'No data'}</TableEmpty>
                ) : (
                  breakdown.byMethod.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell className="text-sm">{row.method}</TableCell>
                      <TableCell className="text-end tabular-nums">{usd(row.revenue, locale, 2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'حسب الدولة' : 'By country'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {breakdown.byCountry.length === 0 ? (
                  <TableEmpty colSpan={2}>{isAr ? 'لا بيانات' : 'No data'}</TableEmpty>
                ) : (
                  breakdown.byCountry.slice(0, 10).map((row) => (
                    <TableRow key={row.country}>
                      <TableCell className="text-sm">{countryLabel(row.country, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums">{usd(row.revenue, locale, 2)}</TableCell>
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

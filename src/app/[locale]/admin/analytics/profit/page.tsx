import { setRequestLocale } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';
import { requireAdminPage } from '@/lib/authz';
import { parseListParams } from '@/lib/admin/query';
import { getPlanProfit, getUnprofitableTrainers, rangeOrDefault, getOverviewStats } from '@/lib/admin/analytics';
import { AdminPage, AdminSection } from '@/components/admin/page-shell';
import { StatCard } from '@/components/admin/stat-card';
import { SignedBarChart } from '@/components/charts/charts';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const money = (v: number, locale: string, digits = 2) =>
  `$${v.toLocaleString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

export default async function ProfitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('analytics.profit', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp);
  const range = rangeOrDefault(listParams.from, listParams.to, 30);

  const [planProfit, unprofitable, overview] = await Promise.all([
    getPlanProfit(range),
    getUnprofitableTrainers(range),
    getOverviewStats(range),
  ]);

  const totals = planProfit.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenueUsd,
      ai: acc.ai + p.aiCostUsd,
      other: acc.other + p.otherCostUsd,
      net: acc.net + p.netUsd,
    }),
    { revenue: 0, ai: 0, other: 0, net: 0 },
  );
  const totalMargin = totals.revenue > 0 ? Math.round((totals.net / totals.revenue) * 1000) / 10 : 0;

  const chartData = planProfit
    .filter((p) => p.revenueUsd > 0 || p.aiCostUsd > 0)
    .map((p) => ({ name: isAr ? p.nameAr : p.nameEn, net: p.netUsd }));

  return (
    <AdminPage
      title={isAr ? 'الأرباح والهوامش' : 'Profit & margins'}
      description={
        isAr
          ? 'الإيراد ناقص التكاليف الفعلية (الذكاء الاصطناعي، التخزين، رسوم البوابة) لكل خطة.'
          : 'Revenue minus real costs (AI, storage, gateway fees) for each plan.'
      }
    >
      <DataTableToolbar showDateRange searchPlaceholder={isAr ? 'بحث' : 'Search'} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isAr ? 'الإيراد' : 'Revenue'} value={money(totals.revenue, locale, 0)} />
        <StatCard label={isAr ? 'تكلفة الذكاء الاصطناعي' : 'AI cost'} value={money(totals.ai, locale, 2)} invert />
        <StatCard label={isAr ? 'تكاليف أخرى' : 'Other costs'} value={money(totals.other, locale, 2)} invert />
        <StatCard
          label={isAr ? 'صافي الربح' : 'Net profit'}
          value={money(totals.net, locale, 0)}
          sublabel={isAr ? `هامش ${totalMargin}%` : `${totalMargin}% margin`}
        />
      </div>

      {chartData.length > 0 ? (
        <AdminSection title={isAr ? 'صافي الربح لكل خطة' : 'Net profit by plan'}>
          <Card>
            <CardContent className="pt-6">
              <SignedBarChart
                data={chartData}
                valueKey="net"
                label={isAr ? 'صافي الربح' : 'Net profit'}
              />
            </CardContent>
          </Card>
        </AdminSection>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? 'تفصيل الربحية لكل خطة' : 'Profitability by plan'}</CardTitle>
          <CardDescription>
            {isAr
              ? 'تكلفة الـ AI تُنسب لخطة المدرب الحالية، فالرقم يعكس من يستهلك فعلًا.'
              : 'AI cost is attributed to the trainer’s current plan, so the figure reflects who actually consumes it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAr ? 'الخطة' : 'Plan'}</TableHead>
                <TableHead className="text-end">{isAr ? 'مشتركون' : 'Subscribers'}</TableHead>
                <TableHead className="text-end">{isAr ? 'الإيراد' : 'Revenue'}</TableHead>
                <TableHead className="text-end">{isAr ? 'تكلفة AI' : 'AI cost'}</TableHead>
                <TableHead className="text-end">{isAr ? 'تكاليف أخرى' : 'Other'}</TableHead>
                <TableHead className="text-end">{isAr ? 'صافي الربح' : 'Net'}</TableHead>
                <TableHead className="text-end">{isAr ? 'الهامش' : 'Margin'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planProfit.length === 0 ? (
                <TableEmpty colSpan={7}>{isAr ? 'لا توجد بيانات في هذه الفترة' : 'No data in this period'}</TableEmpty>
              ) : (
                planProfit.map((plan) => (
                  <TableRow key={plan.planId}>
                    <TableCell className="font-medium">{isAr ? plan.nameAr : plan.nameEn}</TableCell>
                    <TableCell className="text-end tabular-nums">{plan.subscribers}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(plan.revenueUsd, locale, 0)}</TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {money(plan.aiCostUsd, locale, 2)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {money(plan.otherCostUsd, locale, 2)}
                    </TableCell>
                    <TableCell
                      className={`text-end font-semibold tabular-nums ${plan.netUsd < 0 ? 'text-destructive' : 'text-success'}`}
                    >
                      {money(plan.netUsd, locale, 0)}
                    </TableCell>
                    <TableCell className="text-end">
                      {/* With no revenue the percentage is meaningless, so the
                          badge follows the net figure instead of showing 0%. */}
                      <Badge
                        variant={
                          plan.netUsd < 0
                            ? 'destructive'
                            : plan.revenueUsd === 0
                              ? 'muted'
                              : plan.marginPercent >= 50
                                ? 'success'
                                : 'warning'
                        }
                      >
                        {plan.revenueUsd === 0 ? '—' : `${plan.marginPercent}%`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AdminSection title={isAr ? 'مدربون تكلفتهم أعلى من إيرادهم' : 'Trainers costing more than they pay'}>
        {unprofitable.length === 0 ? (
          <Alert variant="success">
            <AlertTriangle />
            <div>
              <AlertTitle>{isAr ? 'لا يوجد' : 'None'}</AlertTitle>
              <AlertDescription>
                {isAr
                  ? 'كل مدرب يغطي تكلفته في هذه الفترة.'
                  : 'Every trainer covers their cost this period.'}
              </AlertDescription>
            </div>
          </Alert>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? 'المدرب' : 'Trainer'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'دفع' : 'Paid'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'كلّف' : 'Cost'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'الصافي' : 'Net'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unprofitable.map((row) => (
                    <TableRow key={row.trainerId}>
                      <TableCell>
                        <p className="font-medium">{row.trainer?.fullName ?? '—'}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          /c/{row.trainer?.username ?? ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{money(row.revenueUsd, locale, 2)}</TableCell>
                      <TableCell className="text-end tabular-nums">{money(row.costUsd, locale, 2)}</TableCell>
                      <TableCell className="text-end font-semibold tabular-nums text-destructive">
                        {money(row.netUsd, locale, 2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </AdminSection>

      <p className="text-xs text-muted-foreground">
        {isAr
          ? `تنبيه: المبالغ محوّلة للدولار بأسعار تقريبية للتجميع فقط. صافي المنصة في الفترة: ${money(overview.netProfitUsd, locale, 2)}`
          : `Note: amounts are converted to USD at indicative rates for aggregation only. Platform net this period: ${money(overview.netProfitUsd, locale, 2)}`}
      </p>
    </AdminPage>
  );
}

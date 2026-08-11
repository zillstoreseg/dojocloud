import { setRequestLocale } from 'next-intl/server';
import {
  Banknote,
  BadgeCheck,
  Bot,
  Dumbbell,
  MousePointerClick,
  Repeat,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requireAdminPage } from '@/lib/authz';
import { getOverviewStats, getRevenueSeries, getFunnel, rangeOrDefault } from '@/lib/admin/analytics';
import { getPendingCounts } from '@/lib/admin/counts';
import { formatNumber } from '@/lib/money';
import { AdminPage, AdminSection } from '@/components/admin/page-shell';
import { StatCard, FunnelStep } from '@/components/admin/stat-card';
import { TimeSeriesChart } from '@/components/charts/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const usd = (value: number, locale: string) =>
  `$${value.toLocaleString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { maximumFractionDigits: 0 })}`;

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('analytics.overview', locale);

  const isAr = locale === 'ar';
  const range = rangeOrDefault(null, null, 30);

  const [stats, series, funnel, pending] = await Promise.all([
    getOverviewStats(range),
    getRevenueSeries(range),
    getFunnel(range),
    getPendingCounts(),
  ]);

  const maxFunnel = Math.max(funnel.visitors, 1);

  return (
    <AdminPage
      title={isAr ? 'نظرة عامة' : 'Overview'}
      description={isAr ? 'آخر 30 يومًا' : 'Last 30 days'}
    >
      {pending.total > 0 ? (
        <Alert variant="warning">
          <BadgeCheck />
          <div className="flex-1">
            <AlertTitle>{isAr ? 'عناصر بانتظار مراجعتك' : 'Items awaiting your review'}</AlertTitle>
            <AlertDescription>
              {isAr
                ? `${pending.trainers} مدرب · ${pending.certificates} شهادة · ${pending.payments} دفعة · ${pending.traineePayments} اشتراك متدرب`
                : `${pending.trainers} trainers · ${pending.certificates} certificates · ${pending.payments} payments · ${pending.traineePayments} trainee subscriptions`}
            </AlertDescription>
          </div>
          <Button size="sm" asChild>
            <Link href="/admin/activations">{isAr ? 'فتح مركز التفعيلات' : 'Open activations'}</Link>
          </Button>
        </Alert>
      ) : null}

      {/* Money */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isAr ? 'الإيراد الشهري المتكرر (MRR)' : 'Monthly recurring revenue'}
          value={usd(stats.mrrUsd, locale)}
          sublabel={isAr ? `سنويًا ${usd(stats.arrUsd, locale)}` : `${usd(stats.arrUsd, locale)} ARR`}
          icon={<Repeat className="size-4" />}
        />
        <StatCard
          label={isAr ? 'إيراد الفترة' : 'Revenue this period'}
          value={usd(stats.revenueUsd, locale)}
          change={stats.revenueChange}
          icon={<Banknote className="size-4" />}
          href={`/${locale}/admin/analytics/revenue`}
        />
        <StatCard
          label={isAr ? 'صافي الربح' : 'Net profit'}
          value={usd(stats.netProfitUsd, locale)}
          sublabel={isAr ? `هامش ${stats.marginPercent}%` : `${stats.marginPercent}% margin`}
          icon={<TrendingUp className="size-4" />}
          href={`/${locale}/admin/analytics/profit`}
        />
        <StatCard
          label={isAr ? 'تكلفة الذكاء الاصطناعي' : 'AI cost'}
          value={`$${stats.aiCostUsd.toFixed(2)}`}
          invert
          icon={<Bot className="size-4" />}
          href={`/${locale}/admin/analytics/ai`}
        />
      </div>

      {/* Growth */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isAr ? 'اشتراكات نشطة' : 'Active subscriptions'}
          value={formatNumber(stats.activeSubscriptions, locale)}
          sublabel={isAr ? `${stats.trialingSubscriptions} تجربة` : `${stats.trialingSubscriptions} trialing`}
          icon={<Repeat className="size-4" />}
        />
        <StatCard
          label={isAr ? 'اشتراكات جديدة' : 'New subscriptions'}
          value={formatNumber(stats.newSubscriptions, locale)}
          change={stats.newSubscriptionsChange}
          icon={<UserPlus className="size-4" />}
        />
        <StatCard
          label={isAr ? 'معدل الإلغاء' : 'Churn rate'}
          value={`${stats.churnRate}%`}
          sublabel={isAr ? `${stats.churnedSubscriptions} ملغى` : `${stats.churnedSubscriptions} churned`}
          invert
          icon={<TrendingUp className="size-4 rotate-180" />}
        />
        {/* Page views, not unique visitors — the funnel below counts unique
            sessions, so the two figures are deliberately labelled apart. */}
        <StatCard
          label={isAr ? 'مشاهدات الصفحات' : 'Page views'}
          value={formatNumber(stats.pageViews, locale)}
          change={stats.pageViewsChange}
          icon={<MousePointerClick className="size-4" />}
          href={`/${locale}/admin/analytics/traffic`}
        />
      </div>

      {/* Revenue trend */}
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
        {/* Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? 'قمع التحويل' : 'Conversion funnel'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FunnelStep
              slot={0}
              label={isAr ? 'زائر' : 'Visitor'}
              value={formatNumber(funnel.visitors, locale)}
              widthPercent={100}
            />
            <FunnelStep
              slot={1}
              label={isAr ? 'عميل محتمل' : 'Lead'}
              value={formatNumber(funnel.leads, locale)}
              rate={funnel.leadRate}
              rateLabel={isAr ? 'من الزوار' : 'of visitors'}
              widthPercent={(funnel.leads / maxFunnel) * 100}
            />
            <FunnelStep
              slot={2}
              label={isAr ? 'تحوّل لمتدرب' : 'Converted'}
              value={formatNumber(funnel.trainees, locale)}
              rate={funnel.traineeRate}
              rateLabel={isAr ? 'من العملاء المحتملين' : 'of leads'}
              widthPercent={(funnel.trainees / maxFunnel) * 100}
            />
            <FunnelStep
              slot={3}
              label={isAr ? 'متدرب مدفوع' : 'Paying trainee'}
              value={formatNumber(funnel.paidTrainees, locale)}
              rate={funnel.paidRate}
              rateLabel={isAr ? 'من المتحوّلين' : 'of converted'}
              widthPercent={(funnel.paidTrainees / maxFunnel) * 100}
            />
          </CardContent>
        </Card>

        {/* Platform totals — a table, which also supplies the relief the
            light-mode chart palette requires. */}
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? 'أرقام المنصة' : 'Platform totals'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'المؤشر' : 'Metric'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'القيمة' : 'Value'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { icon: Dumbbell, label: isAr ? 'إجمالي المدربين' : 'Total trainers', value: stats.totalTrainers },
                  { icon: BadgeCheck, label: isAr ? 'مدربون معتمدون' : 'Approved trainers', value: stats.approvedTrainers },
                  { icon: Users, label: isAr ? 'إجمالي المتدربين' : 'Total trainees', value: stats.totalTrainees },
                  { icon: Users, label: isAr ? 'متدربون نشطون' : 'Active trainees', value: stats.activeTrainees },
                  { icon: UserPlus, label: isAr ? 'عملاء محتملون (الفترة)' : 'Leads (period)', value: stats.leads },
                ].map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="flex items-center gap-2">
                      <row.icon className="size-4 text-muted-foreground" />
                      {row.label}
                    </TableCell>
                    <TableCell className="text-end font-medium tabular-nums">
                      {formatNumber(row.value, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminPage>
  );
}

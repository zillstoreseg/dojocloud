import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { parseListParams } from '@/lib/list-params';
import { getAiStats, rangeOrDefault } from '@/lib/admin/analytics';
import { AdminPage, AdminSection } from '@/components/admin/page-shell';
import { StatCard } from '@/components/admin/stat-card';
import { TimeSeriesChart } from '@/components/charts/charts';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/money';

export default async function AiUsagePage({
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
  const range = rangeOrDefault(parseListParams(sp).from, parseListParams(sp).to, 30);
  const stats = await getAiStats(range);
  const n = (v: number) => formatNumber(v, locale);

  return (
    <AdminPage
      title={isAr ? 'استهلاك الذكاء الاصطناعي' : 'AI usage'}
      description={
        isAr
          ? 'كل نداء يُسجَّل بتكلفته الفعلية بالدولار، وهي التي تغذّي تقرير الأرباح.'
          : 'Every call is logged with its real USD cost, which feeds the profit report.'
      }
    >
      <DataTableToolbar showDateRange exportEntity="ai-usage" searchPlaceholder={isAr ? 'بحث' : 'Search'} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isAr ? 'عدد التوليدات' : 'Generations'} value={n(stats.calls)} />
        <StatCard label={isAr ? 'التكلفة' : 'Cost'} value={`$${stats.costUsd.toFixed(2)}`} invert />
        <StatCard
          label={isAr ? 'التوكنز' : 'Tokens'}
          value={n(stats.inputTokens + stats.outputTokens)}
          sublabel={isAr ? `${n(stats.inputTokens)} دخل · ${n(stats.outputTokens)} خرج` : `${n(stats.inputTokens)} in · ${n(stats.outputTokens)} out`}
        />
        <StatCard
          label={isAr ? 'معدل الفشل' : 'Failure rate'}
          value={`${stats.failureRate}%`}
          sublabel={isAr ? `${stats.failures} محاولة فاشلة` : `${stats.failures} failed`}
          invert
        />
      </div>

      <AdminSection title={isAr ? 'التوليدات والتكلفة يوميًا' : 'Daily generations and cost'}>
        <Card>
          <CardContent className="pt-6">
            <TimeSeriesChart
              data={stats.series}
              series={[{ key: 'calls', label: isAr ? 'عدد التوليدات' : 'Generations', slot: 0 }]}
            />
          </CardContent>
        </Card>
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'حسب الميزة' : 'By feature'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الميزة' : 'Feature'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'عدد' : 'Calls'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'التكلفة' : 'Cost'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byFeature.length === 0 ? (
                  <TableEmpty colSpan={3}>{isAr ? 'لا استخدام بعد' : 'No usage yet'}</TableEmpty>
                ) : (
                  stats.byFeature.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="text-sm" dir="ltr">{row.feature}</TableCell>
                      <TableCell className="text-end tabular-nums">{n(row.calls)}</TableCell>
                      <TableCell className="text-end tabular-nums">${row.costUsd.toFixed(3)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? 'أكثر المدربين استهلاكًا' : 'Heaviest users'}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'المدرب' : 'Trainer'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'عدد' : 'Calls'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'التكلفة' : 'Cost'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topUsers.length === 0 ? (
                  <TableEmpty colSpan={3}>{isAr ? 'لا استخدام بعد' : 'No usage yet'}</TableEmpty>
                ) : (
                  stats.topUsers.map((row) => (
                    <TableRow key={row.trainerId}>
                      <TableCell>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">/c/{row.username}</p>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{n(row.calls)}</TableCell>
                      <TableCell className="text-end">
                        <Badge variant={row.costUsd > 5 ? 'warning' : 'muted'}>${row.costUsd.toFixed(2)}</Badge>
                      </TableCell>
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

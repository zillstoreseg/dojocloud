import { setRequestLocale } from 'next-intl/server';
import { Plus, Pencil } from 'lucide-react';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { AdminPage } from '@/components/admin/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney, planPrice, decimalToNumber } from '@/lib/money';
import { PlanEditor } from './plan-editor';
import { PlanFeatureMatrix } from './feature-matrix';
import type { PlanInput } from './actions';

export default async function AdminPlansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('plans.read', locale);

  const isAr = locale === 'ar';

  const [plans, flags] = await Promise.all([
    prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        planFeatures: { select: { flagKey: true, enabled: true, limitValue: true } },
        _count: { select: { subscriptions: true } },
      },
    }),
    prisma.featureFlag.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
  ]);

  const toInput = (plan: (typeof plans)[number]): PlanInput => {
    const highlights = (plan.highlights as { ar?: string[]; en?: string[] } | null) ?? {};
    return {
      id: plan.id,
      key: plan.key,
      nameAr: plan.nameAr,
      nameEn: plan.nameEn,
      taglineAr: plan.taglineAr ?? '',
      taglineEn: plan.taglineEn ?? '',
      prices: (plan.prices as Record<string, number>) ?? {},
      interval: plan.interval,
      trialDays: plan.trialDays,
      maxTrainees: plan.maxTrainees,
      maxLandingPages: plan.maxLandingPages,
      maxExercises: plan.maxExercises,
      maxNutritionPlans: plan.maxNutritionPlans,
      maxTrainerSeats: plan.maxTrainerSeats,
      aiCreditsPerCycle: plan.aiCreditsPerCycle,
      storageMb: plan.storageMb,
      commissionPercent: decimalToNumber(plan.commissionPercent),
      highlightsAr: highlights.ar?.length ? highlights.ar : [''],
      highlightsEn: highlights.en?.length ? highlights.en : [''],
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      isPopular: plan.isPopular,
      sortOrder: plan.sortOrder,
    };
  };

  const limit = (value: number | null) => (value === null ? (isAr ? 'غير محدود' : 'Unlimited') : value);

  return (
    <AdminPage
      title={isAr ? 'الخطط والأسعار' : 'Plans & pricing'}
      description={
        isAr
          ? 'الأسعار والحدود والمميزات — كل شيء قابل للتعديل، والتغيير يسري فورًا.'
          : 'Prices, limits and features — all editable, and changes take effect immediately.'
      }
      actions={
        <PlanEditor
          trigger={
            <Button>
              <Plus />
              {isAr ? 'خطة جديدة' : 'New plan'}
            </Button>
          }
        />
      }
    >
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={plan.isPopular ? 'border-primary' : undefined}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{isAr ? plan.nameAr : plan.nameEn}</h3>
                    {plan.isPopular ? <Badge>{isAr ? 'الأكثر اختيارًا' : 'Popular'}</Badge> : null}
                    {!plan.isActive ? (
                      <Badge variant="destructive">{isAr ? 'معطّلة' : 'Inactive'}</Badge>
                    ) : null}
                    {!plan.isPublic ? (
                      <Badge variant="muted">{isAr ? 'مخفية' : 'Hidden'}</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    {plan.key}
                  </p>
                </div>
                <PlanEditor
                  plan={toInput(plan)}
                  trigger={
                    <Button variant="ghost" size="icon-sm">
                      <Pencil />
                    </Button>
                  }
                />
              </div>

              <p className="text-2xl font-bold">
                {formatMoney(planPrice(plan.prices, 'EGP'), 'EGP', locale)}
                <span className="text-sm font-normal text-muted-foreground">
                  /
                  {plan.interval === 'MONTHLY'
                    ? isAr ? 'شهر' : 'mo'
                    : plan.interval === 'QUARTERLY'
                      ? isAr ? '3 شهور' : 'qtr'
                      : isAr ? 'سنة' : 'yr'}
                </span>
              </p>

              <dl className="space-y-1.5 text-sm">
                {[
                  [isAr ? 'المتدربون' : 'Trainees', limit(plan.maxTrainees)],
                  [isAr ? 'صفحات الهبوط' : 'Landing pages', limit(plan.maxLandingPages)],
                  [isAr ? 'رصيد AI شهريًا' : 'AI credits', plan.aiCreditsPerCycle],
                  [isAr ? 'نسبة المنصة' : 'Platform fee', `${decimalToNumber(plan.commissionPercent)}%`],
                  [isAr ? 'مقاعد المدربين' : 'Coach seats', plan.maxTrainerSeats],
                  [isAr ? 'مشتركون' : 'Subscribers', plan._count.subscriptions],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      <PlanFeatureMatrix
        plans={plans.map((p) => ({
          id: p.id,
          name: isAr ? p.nameAr : p.nameEn,
          features: p.planFeatures,
        }))}
        flags={flags.map((f) => ({
          key: f.key,
          name: f.name,
          type: f.type,
          category: f.category,
          defaultEnabled: f.defaultEnabled,
        }))}
      />
    </AdminPage>
  );
}

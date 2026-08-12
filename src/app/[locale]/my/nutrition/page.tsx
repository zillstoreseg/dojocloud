import { setRequestLocale } from 'next-intl/server';
import { Apple } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireTraineePage, dayBudget } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MacroRings, StatRing } from '@/components/ui/stat-ring';
import { decimalToNumber } from '@/lib/money';

const MEAL_LABELS: Record<string, { ar: string; en: string }> = {
  BREAKFAST: { ar: 'فطار', en: 'Breakfast' },
  LUNCH: { ar: 'غدا', en: 'Lunch' },
  DINNER: { ar: 'عشا', en: 'Dinner' },
  SNACK: { ar: 'سناك', en: 'Snack' },
  PRE_WORKOUT: { ar: 'قبل التمرين', en: 'Pre-workout' },
  POST_WORKOUT: { ar: 'بعد التمرين', en: 'Post-workout' },
};

export default async function MyNutritionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const [plan, budget] = await Promise.all([
    prisma.nutritionPlan.findFirst({
      where: { traineeId: ctx.traineeId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: {
          orderBy: { order: 'asc' },
          include: { items: { orderBy: { order: 'asc' } } },
        },
      },
    }),
    dayBudget(ctx),
  ]);

  return (
    <TraineePage
      title={isAr ? 'تغذيتي' : 'My nutrition'}
      description={
        budget.source === 'plan'
          ? isAr
            ? 'الأرقام دي من الخطة اللي كتبها لك مدربك.'
            : 'These numbers come from the plan your coach wrote.'
          : budget.source === 'computed'
            ? isAr
              ? 'مفيش خطة مكتوبة لسه، فالأرقام محسوبة من بياناتك وهدفك.'
              : 'No written plan yet, so these targets are computed from your data and goal.'
            : isAr
              ? 'محتاجين طولك ووزنك وتاريخ ميلادك عشان نحسب هدفك.'
              : 'We need your height, weight and birth date to compute a target.'
      }
    >
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <StatRing
            value={budget.target > 0 ? budget.consumed / budget.target : 0}
            size={104}
            tone={budget.remaining < 0 ? 'destructive' : 'primary'}
            label={isAr ? 'من هدف اليوم' : 'of today'}
          >
            <span className="text-base">{budget.consumed}</span>
          </StatRing>

          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'هدف السعرات' : 'Calorie target'}</p>
            <p className="font-display text-4xl font-bold tabular-nums">{budget.target}</p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `مقسومة على ${budget.mealsPerDay} وجبات ≈ ${Math.round(budget.target / Math.max(1, budget.mealsPerDay))} للوجبة`
                : `Split over ${budget.mealsPerDay} meals ≈ ${Math.round(budget.target / Math.max(1, budget.mealsPerDay))} each`}
            </p>
          </div>

          <MacroRings
            className="ms-auto"
            size={72}
            macros={[
              {
                label: isAr ? 'بروتين' : 'Protein',
                value: budget.protein.consumed,
                target: budget.protein.target,
                tone: 'primary',
              },
              {
                label: isAr ? 'كارب' : 'Carbs',
                value: budget.carbs.consumed,
                target: budget.carbs.target,
                tone: 'brand',
              },
              {
                label: isAr ? 'دهون' : 'Fat',
                value: budget.fat.consumed,
                target: budget.fat.target,
                tone: 'info',
              },
            ]}
          />
        </CardContent>
      </Card>

      {!plan || plan.meals.length === 0 ? (
        <EmptyState
          icon={<Apple />}
          title={isAr ? 'مفيش نظام غذائي مكتوب' : 'No written plan yet'}
          description={
            isAr
              ? 'مدربك لسه ما كتبش وجباتك. لحد ما يكتبها، الأرقام فوق هدفك اليومي.'
              : 'Your coach hasn’t written your meals yet. Until then, the numbers above are your daily target.'
          }
        />
      ) : (
        <div className="space-y-3">
          {plan.meals.map((meal) => {
            const totals = meal.items.reduce(
              (acc, item) => ({
                kcal: acc.kcal + decimalToNumber(item.kcal),
                protein: acc.protein + decimalToNumber(item.protein),
                carbs: acc.carbs + decimalToNumber(item.carbs),
                fat: acc.fat + decimalToNumber(item.fat),
              }),
              { kcal: 0, protein: 0, carbs: 0, fat: 0 },
            );

            return (
              <Card key={meal.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-semibold">{meal.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {MEAL_LABELS[meal.type]?.[isAr ? 'ar' : 'en'] ?? meal.type}
                        {meal.timeHint ? ` · ${meal.timeHint}` : ''}
                      </p>
                    </div>
                    <Badge variant="muted">
                      {Math.round(totals.kcal)} {isAr ? 'سعر' : 'kcal'}
                    </Badge>
                  </div>

                  <ul className="divide-y rounded-lg border text-sm">
                    {meal.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 p-3">
                        <span className="min-w-0 truncate">{item.foodName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {decimalToNumber(item.qty)}
                          {item.unit} · {Math.round(decimalToNumber(item.kcal))}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="text-xs text-muted-foreground tabular-nums">
                    {isAr ? 'بروتين' : 'P'} {Math.round(totals.protein)} ·{' '}
                    {isAr ? 'كارب' : 'C'} {Math.round(totals.carbs)} · {isAr ? 'دهون' : 'F'}{' '}
                    {Math.round(totals.fat)}
                  </p>

                  {meal.note ? <p className="text-sm">{meal.note}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </TraineePage>
  );
}

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { decimalToNumber, formatNumber } from '@/lib/money';
import { TrainerPage } from '@/components/trainer/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MacroRings } from '@/components/ui/stat-ring';
import { MealEditor, type MealRow, type FoodOption } from './meal-editor';

export default async function NutritionPlanPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const plan = await prisma.nutritionPlan.findFirst({
    where: { id, trainerId: user.trainerId },
    include: {
      trainee: { select: { id: true, fullName: true } },
      meals: {
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } },
      },
    },
  });
  if (!plan) notFound();

  const foods = await prisma.foodItem.findMany({
    where: { OR: [{ trainerId: user.trainerId }, { trainerId: null, isPublic: true }] },
    orderBy: { nameAr: 'asc' },
    take: 300,
  });

  const foodOptions: FoodOption[] = foods.map((food) => ({
    id: food.id,
    name: isAr ? food.nameAr : food.nameEn,
    baseQty: decimalToNumber(food.baseQty),
    unit: food.unit,
    kcal: decimalToNumber(food.kcal),
  }));

  // Totals are summed from the snapshotted item macros, so they always match
  // what is printed on each row.
  const totals = plan.meals.reduce(
    (acc, meal) => {
      for (const item of meal.items) {
        acc.kcal += decimalToNumber(item.kcal);
        acc.protein += decimalToNumber(item.protein);
        acc.carbs += decimalToNumber(item.carbs);
        acc.fat += decimalToNumber(item.fat);
      }
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const labels = isAr
    ? {
        kcal: 'سعرة',
        p: 'ب',
        c: 'ك',
        f: 'د',
        qty: 'الكمية',
        add: 'أضف',
        addFood: 'أضف صنف',
        remove: 'حذف',
        deleteMeal: 'حذف الوجبة',
        confirmDeleteMeal: 'حذف وجبة «{name}» بكل أصنافها؟',
        noItems: 'مفيش أصناف في الوجبة دي لسه',
        pickFood: 'اختر صنف',
        pickFoodHint: 'السعرات بتتحسب من الكمية اللي تحطها',
        searchFood: 'ابحث…',
        noMatches: 'لا توجد نتائج',
      }
    : {
        kcal: 'kcal',
        p: 'P',
        c: 'C',
        f: 'F',
        qty: 'Qty',
        add: 'Add',
        addFood: 'Add food',
        remove: 'Remove',
        deleteMeal: 'Delete meal',
        confirmDeleteMeal: 'Delete the “{name}” meal and everything in it?',
        noItems: 'Nothing in this meal yet',
        pickFood: 'Pick a food',
        pickFoodHint: 'Calories scale with the quantity you enter',
        searchFood: 'Search…',
        noMatches: 'No matches',
      };

  return (
    <TrainerPage
      title={plan.name}
      description={plan.description ?? undefined}
      actions={
        <>
          {plan.trainee ? (
            <Button variant="outline" asChild>
              <Link href={`/dash/trainees/${plan.trainee.id}`}>
                <User />
                {plan.trainee.fullName}
              </Link>
            </Button>
          ) : (
            <Badge variant="muted">{isAr ? 'قالب' : 'Template'}</Badge>
          )}
          <Button variant="outline" asChild>
            <Link href="/dash/nutrition">{isAr ? 'كل الأنظمة' : 'All plans'}</Link>
          </Button>
        </>
      }
    >
      {/* Running totals against the plan's targets. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-6 p-6">
          <div>
            <p className="text-sm text-muted-foreground">
              {isAr ? 'إجمالي اليوم' : 'Daily total'}
            </p>
            <p className="font-display text-3xl font-semibold tabular-nums text-primary">
              {formatNumber(Math.round(totals.kcal), locale)}
              {plan.targetKcal ? (
                <span className="text-base font-normal text-muted-foreground">
                  {' '}
                  / {formatNumber(plan.targetKcal, locale)}
                </span>
              ) : null}
              <span className="ms-1 text-base font-normal text-muted-foreground">{labels.kcal}</span>
            </p>
          </div>

          <MacroRings
            macros={[
              {
                label: isAr ? 'بروتين' : 'Protein',
                value: totals.protein,
                target: plan.targetProtein ?? (totals.protein || 1),
                tone: 'primary',
              },
              {
                label: isAr ? 'كارب' : 'Carbs',
                value: totals.carbs,
                target: plan.targetCarbs ?? (totals.carbs || 1),
                tone: 'info',
              },
              {
                label: isAr ? 'دهون' : 'Fat',
                value: totals.fat,
                target: plan.targetFat ?? (totals.fat || 1),
                tone: 'brand',
              },
            ]}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {plan.meals.map((meal) => {
          const row: MealRow = {
            id: meal.id,
            name: meal.name,
            items: meal.items.map((item) => ({
              id: item.id,
              foodName: item.foodName,
              qty: decimalToNumber(item.qty),
              unit: item.unit,
              kcal: decimalToNumber(item.kcal),
              protein: decimalToNumber(item.protein),
              carbs: decimalToNumber(item.carbs),
              fat: decimalToNumber(item.fat),
            })),
          };
          return <MealEditor key={meal.id} meal={row} foods={foodOptions} labels={labels} />;
        })}
      </div>
    </TrainerPage>
  );
}

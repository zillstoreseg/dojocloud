import { setRequestLocale } from 'next-intl/server';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { energyTargets, ageFrom } from '@/lib/nutrition';
import { nutritionGoal, nutritionActivity } from '@/lib/training';
import { TrainerPage } from '@/components/trainer/page-shell';
import { PlanList, type PlanCard, type TraineeOption } from './plan-list';

export default async function NutritionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const [plans, trainees] = await Promise.all([
    prisma.nutritionPlan.findMany({
      where: { trainerId: user.trainerId },
      orderBy: { createdAt: 'desc' },
      include: {
        trainee: { select: { fullName: true } },
        _count: { select: { meals: true } },
      },
    }),
    prisma.trainee.findMany({
      where: { trainerId: user.trainerId, status: 'ACTIVE' },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const rows: PlanCard[] = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    isTemplate: plan.isTemplate,
    traineeName: plan.trainee?.fullName ?? null,
    targetKcal: plan.targetKcal,
    mealCount: plan._count.meals,
  }));

  // Each trainee carries their computed targets so the new-plan form can fill
  // them in rather than making the coach retype what the profile already says.
  const traineeOptions: TraineeOption[] = trainees.map((trainee) => {
    const canCompute = Boolean(trainee.heightCm && trainee.startWeightKg && trainee.birthDate);
    const targets = canCompute
      ? energyTargets({
          weightKg: Number(trainee.startWeightKg),
          heightCm: Number(trainee.heightCm),
          age: ageFrom(trainee.birthDate!),
          sex: trainee.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
          activity: nutritionActivity(trainee.activityLevel),
          goal: nutritionGoal(trainee.goal),
        })
      : null;

    return {
      value: trainee.id,
      label: trainee.fullName,
      calorieTarget: targets?.calorieTarget ?? null,
      protein: targets?.macros.protein ?? null,
      carbs: targets?.macros.carbs ?? null,
      fat: targets?.macros.fat ?? null,
    };
  });

  return (
    <TrainerPage
      title={isAr ? 'أنظمة التغذية' : 'Nutrition plans'}
      description={
        isAr
          ? 'اختر متدربًا وهنملالك أهدافه من السعرات تلقائيًا، وابنِ وجباته.'
          : 'Pick a trainee and we fill in their calorie targets, then build their meals.'
      }
    >
      <PlanList
        rows={rows}
        trainees={traineeOptions}
        labels={
          isAr
            ? {
                add: 'نظام جديد',
                addTitle: 'نظام غذائي جديد',
                formSubtitle: 'هنجهّزلك أربع وجبات مبدئية، وتعدّل عليها زي ما تحب.',
                defaultName: 'نظام {name}',
                name: 'اسم النظام',
                trainee: 'المتدرب',
                traineeHint: 'اختياره بيملأ الأهداف من بياناته',
                isTemplate: 'خليه قالبًا',
                isTemplateHint: 'القالب مش مربوط بمتدرب',
                kcalTarget: 'السعرات',
                protein: 'بروتين',
                carbs: 'كارب',
                fat: 'دهون',
                description: 'الوصف',
                template: 'قالب',
                kcal: 'سعرة',
                meals: '{n} وجبات',
                delete: 'حذف',
                create: 'أنشئ وابدأ',
                cancel: 'إلغاء',
                upgrade: 'رقّي خطتك',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
                confirmDelete: 'حذف نظام «{name}»؟',
                emptyTitle: 'لسه مفيش أنظمة تغذية',
                emptyDescription: 'ابنِ أول نظام غذائي لمتدربك بالسعرات والماكروز.',
              }
            : {
                add: 'New plan',
                addTitle: 'New nutrition plan',
                formSubtitle: 'We create four starter meals; adjust them however you like.',
                defaultName: '{name}’s plan',
                name: 'Plan name',
                trainee: 'Trainee',
                traineeHint: 'Picking one fills the targets from their profile',
                isTemplate: 'Make it a template',
                isTemplateHint: 'A template is not tied to a trainee',
                kcalTarget: 'Calories',
                protein: 'Protein',
                carbs: 'Carbs',
                fat: 'Fat',
                description: 'Description',
                template: 'Template',
                kcal: 'kcal',
                meals: '{n} meals',
                delete: 'Delete',
                create: 'Create and start',
                cancel: 'Cancel',
                upgrade: 'Upgrade',
                generic: 'Something went wrong, please try again',
                confirmDelete: 'Delete the “{name}” plan?',
                emptyTitle: 'No nutrition plans yet',
                emptyDescription: 'Build your first plan with calories and macros.',
              }
        }
      />
    </TrainerPage>
  );
}

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import {
  Activity,
  Apple,
  CalendarClock,
  ClipboardList,
  HeartPulse,
  Ruler,
  Target,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { daysRemaining } from '@/lib/billing';
import { formatNumber } from '@/lib/money';
import { energyTargets, ageFrom, type EnergyTargets } from '@/lib/nutrition';
import {
  GOAL_LABELS,
  ACTIVITY_LABELS,
  TRAINEE_STATUS_LABELS,
  label as pickLabel,
  nutritionGoal,
  nutritionActivity,
} from '@/lib/training';
import { TrainerPage, TrainerSection } from '@/components/trainer/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { MacroRings } from '@/components/ui/stat-ring';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { initials } from '@/lib/utils';

export default async function TraineeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  // Scoped read: the `trainerId` filter is what makes another coach's trainee
  // indistinguishable from one that does not exist.
  const trainee = await prisma.trainee.findFirst({
    where: { id, trainerId: user.trainerId },
    include: {
      workoutPrograms: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, isActive: true, createdAt: true },
      },
      nutritionPlans: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, isActive: true, targetKcal: true },
      },
      measurements: { orderBy: { takenAt: 'desc' }, take: 5 },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { package: { select: { name: true } } },
      },
    },
  });
  if (!trainee) notFound();

  // Targets are only computable once the basics are known; showing zeros would
  // be worse than saying what is missing.
  const canCompute = Boolean(trainee.heightCm && trainee.startWeightKg && trainee.birthDate);
  const targets: EnergyTargets | null = canCompute
    ? energyTargets({
        weightKg: Number(trainee.startWeightKg),
        heightCm: Number(trainee.heightCm),
        age: ageFrom(trainee.birthDate!),
        sex: trainee.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
        activity: nutritionActivity(trainee.activityLevel),
        goal: nutritionGoal(trainee.goal),
      })
    : null;

  const renewalIn = trainee.renewalDate ? daysRemaining(trainee.renewalDate) : null;
  const subscription = trainee.subscriptions[0];

  const facts = [
    { icon: Target, label: isAr ? 'الهدف' : 'Goal', value: pickLabel(GOAL_LABELS, trainee.goal, locale) },
    {
      icon: Activity,
      label: isAr ? 'النشاط' : 'Activity',
      value: pickLabel(ACTIVITY_LABELS, trainee.activityLevel, locale),
    },
    {
      icon: Ruler,
      label: isAr ? 'الطول / الوزن' : 'Height / weight',
      value:
        trainee.heightCm && trainee.startWeightKg
          ? `${Number(trainee.heightCm)} ${isAr ? 'سم' : 'cm'} · ${Number(trainee.startWeightKg)} ${isAr ? 'كجم' : 'kg'}`
          : '—',
    },
    {
      icon: CalendarClock,
      label: isAr ? 'التجديد' : 'Renewal',
      value:
        renewalIn === null
          ? '—'
          : isAr
            ? `بعد ${formatNumber(renewalIn, locale)} يوم`
            : `in ${renewalIn} days`,
    },
  ];

  return (
    <TrainerPage
      title={trainee.fullName}
      description={
        [trainee.phone, trainee.email].filter(Boolean).join(' · ') ||
        (isAr ? 'بدون بيانات تواصل' : 'No contact details')
      }
      actions={
        <Button variant="outline" asChild>
          <Link href="/dash/trainees">{isAr ? 'كل المتدربين' : 'All trainees'}</Link>
        </Button>
      }
    >
      {/* Identity + facts */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback>{initials(trainee.fullName)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-display text-lg font-semibold">{trainee.fullName}</p>
              <Badge
                variant={
                  trainee.status === 'ACTIVE'
                    ? 'success'
                    : trainee.status === 'PAUSED'
                      ? 'warning'
                      : 'muted'
                }
                className="mt-1"
              >
                {pickLabel(TRAINEE_STATUS_LABELS, trainee.status, locale)}
              </Badge>
            </div>
          </div>

          <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-start gap-2">
                <fact.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="truncate text-sm font-medium">{fact.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Health flags come before targets: they change what is safe to program. */}
      {trainee.injuries || trainee.medicalNotes ? (
        <Alert variant="warning">
          <HeartPulse />
          <div>
            <AlertTitle>{isAr ? 'انتبه قبل ما تبني البرنامج' : 'Read before programming'}</AlertTitle>
            <AlertDescription>
              {[trainee.injuries, trainee.medicalNotes].filter(Boolean).join(' — ')}
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <TrainerSection
        title={isAr ? 'احتياجه من السعرات' : 'Energy needs'}
        description={
          isAr
            ? 'محسوبة من وزنه وطوله وسنه ونشاطه وهدفه (Mifflin-St Jeor).'
            : 'Computed from weight, height, age, activity and goal (Mifflin-St Jeor).'
        }
      >
        {targets ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-8 p-6">
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                {[
                  { label: isAr ? 'كتلة الجسم' : 'BMI', value: formatNumber(targets.bmi, locale) },
                  { label: 'BMR', value: formatNumber(targets.bmr, locale) },
                  { label: 'TDEE', value: formatNumber(targets.tdee, locale) },
                  {
                    label: isAr ? 'هدف السعرات' : 'Calorie target',
                    value: formatNumber(targets.calorieTarget, locale),
                    accent: true,
                  },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p
                      className={`font-display text-xl font-semibold tabular-nums ${stat.accent ? 'text-primary' : ''}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <MacroRings
                macros={[
                  {
                    label: isAr ? 'بروتين' : 'Protein',
                    value: targets.macros.protein,
                    target: targets.macros.protein,
                    tone: 'primary',
                  },
                  {
                    label: isAr ? 'كارب' : 'Carbs',
                    value: targets.macros.carbs,
                    target: targets.macros.carbs,
                    tone: 'info',
                  },
                  {
                    label: isAr ? 'دهون' : 'Fat',
                    value: targets.macros.fat,
                    target: targets.macros.fat,
                    tone: 'brand',
                  },
                ]}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={<Target />}
            title={isAr ? 'ناقص بيانات للحساب' : 'Not enough data to compute'}
            description={
              isAr
                ? 'محتاج الطول والوزن وتاريخ الميلاد عشان نحسب سعراته وماكروزه.'
                : 'Height, weight and date of birth are needed to compute calories and macros.'
            }
          />
        )}
      </TrainerSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <TrainerSection title={isAr ? 'برامج التدريب' : 'Training programs'}>
          {trainee.workoutPrograms.length === 0 ? (
            <EmptyState
              icon={<ClipboardList />}
              title={isAr ? 'مفيش برنامج بعد' : 'No program yet'}
              description={isAr ? 'ابنِ له برنامجًا من قسم البرامج.' : 'Build one from Programs.'}
              action={
                <Button size="sm" asChild>
                  <Link href="/dash/programs">{isAr ? 'البرامج' : 'Programs'}</Link>
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border/60 p-0">
                {trainee.workoutPrograms.map((program) => (
                  <Link
                    key={program.id}
                    href={`/dash/programs/${program.id}`}
                    className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/50"
                  >
                    <span className="truncate font-medium">{program.name}</span>
                    <Badge variant={program.isActive ? 'success' : 'muted'}>
                      {program.isActive ? (isAr ? 'نشط' : 'Active') : isAr ? 'متوقف' : 'Inactive'}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </TrainerSection>

        <TrainerSection title={isAr ? 'أنظمة التغذية' : 'Nutrition plans'}>
          {trainee.nutritionPlans.length === 0 ? (
            <EmptyState
              icon={<Apple />}
              title={isAr ? 'مفيش نظام غذائي بعد' : 'No nutrition plan yet'}
              description={
                isAr ? 'ابنِ له نظامًا من قسم التغذية.' : 'Build one from the Nutrition section.'
              }
              action={
                <Button size="sm" asChild>
                  <Link href="/dash/nutrition">{isAr ? 'التغذية' : 'Nutrition'}</Link>
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border/60 p-0">
                {trainee.nutritionPlans.map((plan) => (
                  <Link
                    key={plan.id}
                    href={`/dash/nutrition/${plan.id}`}
                    className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/50"
                  >
                    <span className="truncate font-medium">{plan.name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {plan.targetKcal
                        ? `${formatNumber(plan.targetKcal, locale)} ${isAr ? 'سعرة' : 'kcal'}`
                        : '—'}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </TrainerSection>
      </div>

      {subscription ? (
        <TrainerSection title={isAr ? 'الاشتراك' : 'Subscription'}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="text-sm text-muted-foreground">{isAr ? 'الباقة' : 'Package'}</p>
                <p className="font-medium">{subscription.package?.name ?? '—'}</p>
              </div>
              <Badge
                variant={
                  subscription.status === 'APPROVED'
                    ? 'success'
                    : subscription.status === 'REJECTED'
                      ? 'destructive'
                      : 'warning'
                }
              >
                {subscription.status}
              </Badge>
            </CardContent>
          </Card>
        </TrainerSection>
      ) : null}
    </TrainerPage>
  );
}

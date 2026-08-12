import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { MUSCLE_GROUP_LABELS, GOAL_LABELS, label as pickLabel } from '@/lib/training';
import { formatNumber } from '@/lib/money';
import { TrainerPage } from '@/components/trainer/page-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DayEditor, type DayRow, type ExerciseOption } from './day-editor';

// Latin numerals even in Arabic, matching `ar-EG-u-nu-latn` everywhere else.
const DAY_NAMES_AR = ['اليوم 1', 'اليوم 2', 'اليوم 3', 'اليوم 4', 'اليوم 5', 'اليوم 6', 'اليوم 7'];

export default async function ProgramBuilderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  // Scoped read: another trainer's program is indistinguishable from a
  // nonexistent one.
  const program = await prisma.workoutProgram.findFirst({
    where: { id, trainerId: user.trainerId },
    include: {
      trainee: { select: { id: true, fullName: true } },
      weeks: {
        orderBy: { weekNumber: 'asc' },
        include: {
          days: {
            orderBy: { dayNumber: 'asc' },
            include: {
              items: {
                orderBy: { order: 'asc' },
                include: { exercise: { select: { nameAr: true, nameEn: true, muscleGroup: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!program) notFound();

  // The picker offers this trainer's own exercises plus the shared library.
  const exercises = await prisma.exercise.findMany({
    where: {
      isActive: true,
      OR: [{ trainerId: user.trainerId }, { trainerId: null, isPublic: true }],
    },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, nameEn: true, muscleGroup: true },
  });

  const exerciseOptions: ExerciseOption[] = exercises.map((e) => ({
    id: e.id,
    name: isAr ? e.nameAr : e.nameEn,
    muscleLabel: pickLabel(MUSCLE_GROUP_LABELS, e.muscleGroup, locale),
  }));

  const labels = isAr
    ? {
        drag: 'اسحب لإعادة الترتيب',
        sets: 'مجموعات',
        reps: 'تكرارات',
        rest: 'راحة (ث)',
        remove: 'حذف',
        restDay: 'يوم راحة',
        exerciseCount: '{n} تمرين',
        noExercises: 'مفيش تمارين في اليوم ده لسه',
        addExercise: 'أضف تمرين',
        pickExercise: 'اختر تمرين',
        pickExerciseHint: 'من مكتبتك أو المكتبة العامة',
        searchExercise: 'ابحث…',
        noMatches: 'لا توجد نتائج',
      }
    : {
        drag: 'Drag to reorder',
        sets: 'Sets',
        reps: 'Reps',
        rest: 'Rest (s)',
        remove: 'Remove',
        restDay: 'Rest day',
        exerciseCount: '{n} exercises',
        noExercises: 'No exercises on this day yet',
        addExercise: 'Add exercise',
        pickExercise: 'Pick an exercise',
        pickExerciseHint: 'From your library or the shared one',
        searchExercise: 'Search…',
        noMatches: 'No matches',
      };

  const totalItems = program.weeks.reduce(
    (sum, week) => sum + week.days.reduce((s, day) => s + day.items.length, 0),
    0,
  );

  return (
    <TrainerPage
      title={program.name}
      description={
        [
          program.goal ? pickLabel(GOAL_LABELS, program.goal, locale) : null,
          isAr
            ? `${formatNumber(program.weeksCount, locale)} أسابيع`
            : `${program.weeksCount} weeks`,
          isAr ? `${formatNumber(totalItems, locale)} تمرين` : `${totalItems} exercises`,
        ]
          .filter(Boolean)
          .join(' · ')
      }
      actions={
        <>
          {program.trainee ? (
            <Button variant="outline" asChild>
              <Link href={`/dash/trainees/${program.trainee.id}`}>
                <User />
                {program.trainee.fullName}
              </Link>
            </Button>
          ) : (
            <Badge variant="muted">{isAr ? 'قالب' : 'Template'}</Badge>
          )}
          <Button variant="outline" asChild>
            <Link href="/dash/programs">{isAr ? 'كل البرامج' : 'All programs'}</Link>
          </Button>
        </>
      }
    >
      <Tabs defaultValue={`week-${program.weeks[0]?.weekNumber ?? 1}`}>
        <TabsList className="flex-wrap">
          {program.weeks.map((week) => (
            <TabsTrigger key={week.id} value={`week-${week.weekNumber}`}>
              {isAr
                ? `الأسبوع ${formatNumber(week.weekNumber, locale)}`
                : `Week ${week.weekNumber}`}
            </TabsTrigger>
          ))}
        </TabsList>

        {program.weeks.map((week) => (
          <TabsContent key={week.id} value={`week-${week.weekNumber}`} className="space-y-3">
            {week.days.map((day) => {
              const row: DayRow = {
                id: day.id,
                dayNumber: day.dayNumber,
                title: day.title,
                isRestDay: day.isRestDay,
                items: day.items.map((item) => ({
                  id: item.id,
                  exerciseName: isAr ? item.exercise.nameAr : item.exercise.nameEn,
                  muscleLabel: pickLabel(MUSCLE_GROUP_LABELS, item.exercise.muscleGroup, locale),
                  sets: item.sets,
                  reps: item.reps,
                  restSec: item.restSec,
                  note: item.note,
                })),
              };
              return (
                <DayEditor
                  key={day.id}
                  day={row}
                  dayName={
                    day.title ??
                    (isAr ? DAY_NAMES_AR[day.dayNumber - 1] : `Day ${day.dayNumber}`)
                  }
                  exercises={exerciseOptions}
                  labels={labels}
                />
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </TrainerPage>
  );
}

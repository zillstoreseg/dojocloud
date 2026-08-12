import { setRequestLocale } from 'next-intl/server';
import { Apple, Camera, Dumbbell, Ruler } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Link } from '@/i18n/navigation';
import { FLAG_KEYS, isFeatureEnabled } from '@/lib/flags';
import { requireTraineePage, dayBudget, todaysWorkout, dayRange } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatRing, MacroRings } from '@/components/ui/stat-ring';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/money';
import { DayWorkout, type WorkoutItemRow } from './day-workout';

export default async function TraineeHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const coach = await prisma.trainerProfile.findUnique({
    where: { id: ctx.trainerId },
    select: { userId: true },
  });

  const { start, end } = dayRange();

  const [budget, session, canScan, scansToday, lastMeasurement, unread] = await Promise.all([
    dayBudget(ctx),
    todaysWorkout(ctx),
    coach ? isFeatureEnabled(coach.userId, FLAG_KEYS.AI_FOOD_SCAN) : Promise.resolve(false),
    prisma.foodScan.count({
      where: { traineeId: ctx.traineeId, status: 'DONE', loggedAt: { gte: start, lt: end } },
    }),
    prisma.measurement.findFirst({
      where: { traineeId: ctx.traineeId },
      orderBy: { takenAt: 'desc' },
      select: { takenAt: true, weightKg: true },
    }),
    prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
  ]);

  const loggedItems = new Set(session?.logs.map((log) => log.itemId) ?? []);
  const items: WorkoutItemRow[] = (session?.day.items ?? []).map((item) => {
    const log = session?.logs.find((l) => l.itemId === item.id);
    return {
      id: item.id,
      name: isAr ? item.exercise.nameAr : item.exercise.nameEn,
      muscleGroup: item.exercise.muscleGroup,
      videoUrl: item.exercise.videoUrl,
      sets: item.sets,
      reps: item.reps,
      restSec: item.restSec,
      tempo: item.tempo,
      rpe: item.rpe,
      targetWeightKg: item.weightKg ? Number(item.weightKg) : null,
      note: item.note,
      logged: (log?.sets as unknown as { set: number; reps: number; weightKg: number | null }[]) ?? null,
      loggedRpe: log?.rpe ?? null,
    };
  });

  const done = items.filter((item) => loggedItems.has(item.id)).length;

  return (
    <TraineePage
      title={isAr ? `يومك يا ${ctx.fullName.split(' ')[0]}` : `Today, ${ctx.fullName.split(' ')[0]}`}
      description={
        isAr
          ? `مدربك ${ctx.coach.fullName}. كل اللي تحت ده مكتوب لك أنت.`
          : `Your coach is ${ctx.coach.fullName}. Everything below was written for you.`
      }
    >
      {/* ── the day at a glance ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-wrap items-center gap-6 p-6">
            <StatRing
              value={budget.target > 0 ? budget.consumed / budget.target : 0}
              size={104}
              tone={budget.remaining < 0 ? 'destructive' : 'primary'}
              label={isAr ? 'سعرات اليوم' : 'Today’s calories'}
            >
              <span className="text-base">{budget.consumed}</span>
            </StatRing>

            <div>
              <p className="text-sm text-muted-foreground">
                {isAr ? 'فاضلك' : 'Remaining'}
              </p>
              <p
                className={`font-display text-4xl font-bold tabular-nums ${
                  budget.remaining < 0 ? 'text-destructive' : ''
                }`}
              >
                {budget.remaining}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAr ? `من ${budget.target} سعر` : `of ${budget.target} kcal`}
              </p>
            </div>

            <MacroRings
              className="ms-auto"
              size={68}
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

        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm font-medium">{isAr ? 'خطواتك النهارده' : 'Today’s steps'}</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Dumbbell className="size-4" />
                  {isAr ? 'التمرين' : 'Workout'}
                </span>
                {/* Three different states, not two: no program at all is not
                    a rest day, and saying "rest" to someone their coach has
                    not written for yet is a small lie. */}
                <Badge
                  variant={!session ? 'muted' : items.length === 0 ? 'muted' : done >= items.length ? 'success' : 'warning'}
                >
                  {!session
                    ? isAr
                      ? 'لسه'
                      : 'Pending'
                    : items.length === 0
                      ? isAr
                        ? 'راحة'
                        : 'Rest'
                      : `${done} / ${items.length}`}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Apple className="size-4" />
                  {isAr ? 'وجبات مسجّلة' : 'Meals logged'}
                </span>
                <Badge variant={scansToday > 0 ? 'success' : 'muted'}>{scansToday}</Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Ruler className="size-4" />
                  {isAr ? 'آخر قياس' : 'Last measurement'}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {lastMeasurement ? formatDate(lastMeasurement.takenAt, locale) : '—'}
                </span>
              </li>
            </ul>

            {canScan ? (
              <Button asChild className="w-full" variant="brand">
                <Link href="/my/scan">
                  <Camera />
                  {isAr ? 'صوّر وجبتك' : 'Scan a meal'}
                </Link>
              </Button>
            ) : null}

            {unread > 0 ? (
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/my/notifications">
                  {isAr ? `عندك ${unread} إشعار جديد` : `${unread} unread notifications`}
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── today's session ── */}
      {!session ? (
        <EmptyState
          icon={<Dumbbell />}
          title={isAr ? 'لسه مفيش برنامج' : 'No program yet'}
          description={
            isAr
              ? 'مدربك لسه بيجهّز برنامجك. أول ما يخلص هيظهر هنا.'
              : 'Your coach is still writing your program. It will show up here.'
          }
        />
      ) : session.day.isRestDay || items.length === 0 ? (
        <EmptyState
          title={isAr ? 'النهارده راحة' : 'Rest day'}
          description={
            isAr
              ? 'الراحة جزء من البرنامج مش انقطاع عنه. اشرب مياه وكمّل أكلك.'
              : 'Rest is part of the program, not a break from it. Hydrate and keep eating on plan.'
          }
        />
      ) : (
        <DayWorkout
          locale={locale}
          title={
            session.day.title ??
            (isAr
              ? `الأسبوع ${session.weekNumber} · اليوم ${session.dayNumber}`
              : `Week ${session.weekNumber} · Day ${session.dayNumber}`)
          }
          subtitle={session.program.name}
          note={session.day.note}
          items={items}
        />
      )}
    </TraineePage>
  );
}

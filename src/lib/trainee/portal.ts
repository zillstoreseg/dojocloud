import { cache } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUserPage, requireTrainee, type SessionUser } from '@/lib/authz';
import { energyTargets, ageFrom, type EnergyTargets } from '@/lib/nutrition';
import { nutritionGoal, nutritionActivity } from '@/lib/training';

/**
 * Everything the trainee portal reads about the signed-in trainee.
 *
 * A trainee sees exactly one coach's material and nothing else, so this module
 * is the only door: it resolves the trainee row from the session, and every
 * screen below takes its `trainerId` from here rather than from a URL. There is
 * no trainee-facing route that accepts an id.
 */

export interface TraineeContext {
  traineeId: string;
  trainerId: string;
  userId: string;
  fullName: string;
  coach: { fullName: string; username: string; avatarUrl: string | null };
  /** Computed targets, or null when the profile lacks height/weight/birth date. */
  targets: EnergyTargets | null;
  mealsPerDay: number;
  /** Foods the coach's intake recorded as disliked or off-limits. */
  avoidFoods: string[];
  status: string;
}

/**
 * Loads the trainee's context once per request.
 *
 * The intake is preferred over the `Trainee` row for the numbers that drive
 * targets: it is the snapshot the trainee actually answered, and a coach
 * editing the profile later should not silently rewrite the basis of a plan.
 */
export const traineeContext = cache(async (userId: string): Promise<TraineeContext | null> => {
  const trainee = await prisma.trainee.findFirst({
    where: { userId },
    select: {
      id: true,
      trainerId: true,
      fullName: true,
      status: true,
      gender: true,
      birthDate: true,
      heightCm: true,
      startWeightKg: true,
      goal: true,
      activityLevel: true,
      trainer: { select: { fullName: true, username: true, avatarUrl: true } },
      intakes: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: {
          goal: true,
          weightKg: true,
          heightCm: true,
          gender: true,
          birthDate: true,
          activityLevel: true,
          mealsPerDay: true,
          dislikedFoods: true,
          allergies: true,
          calorieTarget: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
          bmi: true,
          bmr: true,
          tdee: true,
        },
      },
      measurements: { orderBy: { takenAt: 'desc' }, take: 1, select: { weightKg: true } },
    },
  });

  if (!trainee) return null;

  const intake = trainee.intakes[0];

  // The most recent weigh-in beats the intake's answer — a target that never
  // moves as the trainee does is a target that stops being true.
  const weightKg = Number(
    trainee.measurements[0]?.weightKg ?? intake?.weightKg ?? trainee.startWeightKg ?? 0,
  );
  const heightCm = Number(intake?.heightCm ?? trainee.heightCm ?? 0);
  const birthDate = intake?.birthDate ?? trainee.birthDate;
  const gender = intake?.gender ?? trainee.gender;

  const targets =
    weightKg > 0 && heightCm > 0 && birthDate
      ? energyTargets({
          weightKg,
          heightCm,
          age: ageFrom(birthDate),
          sex: gender === 'FEMALE' ? 'FEMALE' : 'MALE',
          activity: nutritionActivity(intake?.activityLevel ?? trainee.activityLevel),
          goal: nutritionGoal(intake?.goal ?? trainee.goal),
        })
      : null;

  return {
    traineeId: trainee.id,
    trainerId: trainee.trainerId,
    userId,
    fullName: trainee.fullName,
    coach: {
      fullName: trainee.trainer.fullName,
      username: trainee.trainer.username,
      avatarUrl: trainee.trainer.avatarUrl,
    },
    targets,
    mealsPerDay: intake?.mealsPerDay ?? 3,
    avoidFoods: [...(intake?.dislikedFoods ?? []), ...(intake?.allergies ?? [])],
    status: trainee.status,
  };
});

/** Page guard: signs the visitor in, or 404s if they are not a trainee. */
export async function requireTraineePage(
  locale: string,
): Promise<{ user: SessionUser; ctx: TraineeContext }> {
  const user = await requireUserPage(locale);
  if (user.role !== 'TRAINEE') notFound();

  const ctx = await traineeContext(user.id);
  // A trainee account whose row was deleted has nothing to show; treating it
  // as missing is more honest than an empty portal.
  if (!ctx) notFound();

  return { user, ctx };
}

/** Server-action guard. Throws rather than redirecting. */
export async function requireTraineeContext(): Promise<TraineeContext> {
  const user = await requireTrainee();
  const ctx = await traineeContext(user.id);
  if (!ctx) throw new Error('Trainee profile not found');
  return ctx;
}

/**
 * Which week and day of a program today falls on.
 *
 * Counted from the program's start date in whole weeks, wrapping when the
 * trainee runs past the last week rather than leaving them with nothing: a
 * four-week program in its fifth week repeats, which is what a coach who has
 * not written the next block would have told them to do anyway.
 */
export function programPosition(
  startDate: Date,
  weeksCount: number,
  now: Date = new Date(),
): { weekNumber: number; dayNumber: number } {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const daysElapsed = Math.max(0, Math.round((today.getTime() - start.getTime()) / 864e5));
  const weeks = Math.max(1, weeksCount);

  return {
    weekNumber: (Math.floor(daysElapsed / 7) % weeks) + 1,
    dayNumber: (daysElapsed % 7) + 1,
  };
}

/** Local midnight-to-midnight window, which is what "today" means to a person. */
export function dayRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export interface DayBudget {
  /** The coach's active plan target if there is one, else the computed target. */
  target: number;
  /** Where the target came from — shown to the trainee so it is never a mystery. */
  source: 'plan' | 'computed' | 'none';
  consumed: number;
  remaining: number;
  protein: { target: number; consumed: number };
  carbs: { target: number; consumed: number };
  fat: { target: number; consumed: number };
  mealsPerDay: number;
  nutritionPlanId: string | null;
}

/**
 * What the trainee has left to eat today.
 *
 * Consumption counts only scans the trainee explicitly logged. A photograph
 * they took and discarded is not a meal they ate, and letting a curious snap
 * of someone else's plate eat into the day's budget would make the number
 * untrustworthy — which is the only thing it has going for it.
 */
export async function dayBudget(ctx: TraineeContext, now: Date = new Date()): Promise<DayBudget> {
  const { start, end } = dayRange(now);

  const [plan, logged] = await Promise.all([
    prisma.nutritionPlan.findFirst({
      where: { traineeId: ctx.traineeId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        targetKcal: true,
        targetProtein: true,
        targetCarbs: true,
        targetFat: true,
        _count: { select: { meals: true } },
      },
    }),
    prisma.foodScan.aggregate({
      where: { traineeId: ctx.traineeId, status: 'DONE', loggedAt: { gte: start, lt: end } },
      _sum: { kcal: true, protein: true, carbs: true, fat: true },
    }),
  ]);

  const planTarget = plan?.targetKcal ?? null;
  const target = planTarget ?? ctx.targets?.calorieTarget ?? 0;
  const source: DayBudget['source'] = planTarget ? 'plan' : ctx.targets ? 'computed' : 'none';

  const consumed = logged._sum.kcal ?? 0;

  return {
    target,
    source,
    consumed,
    remaining: target - consumed,
    protein: {
      target: plan?.targetProtein ?? ctx.targets?.macros.protein ?? 0,
      consumed: logged._sum.protein ?? 0,
    },
    carbs: {
      target: plan?.targetCarbs ?? ctx.targets?.macros.carbs ?? 0,
      consumed: logged._sum.carbs ?? 0,
    },
    fat: {
      target: plan?.targetFat ?? ctx.targets?.macros.fat ?? 0,
      consumed: logged._sum.fat ?? 0,
    },
    // A plan with meals defined knows better than the intake's answer.
    mealsPerDay: plan?._count.meals || ctx.mealsPerDay,
    nutritionPlanId: plan?.id ?? null,
  };
}

/** Today's session out of the trainee's active program, with the logs already recorded. */
export async function todaysWorkout(ctx: TraineeContext, now: Date = new Date()) {
  const program = await prisma.workoutProgram.findFirst({
    where: { traineeId: ctx.traineeId, isActive: true, isTemplate: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, weeksCount: true, startDate: true, createdAt: true },
  });
  if (!program) return null;

  const { weekNumber, dayNumber } = programPosition(
    program.startDate ?? program.createdAt,
    program.weeksCount,
    now,
  );

  const day = await prisma.workoutDay.findFirst({
    where: { week: { programId: program.id, weekNumber }, dayNumber },
    select: {
      id: true,
      title: true,
      isRestDay: true,
      note: true,
      items: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          sets: true,
          reps: true,
          restSec: true,
          tempo: true,
          rpe: true,
          weightKg: true,
          note: true,
          exercise: { select: { nameAr: true, nameEn: true, muscleGroup: true, videoUrl: true } },
        },
      },
    },
  });
  if (!day) return null;

  const { start, end } = dayRange(now);
  const logs = await prisma.workoutLog.findMany({
    where: {
      traineeId: ctx.traineeId,
      itemId: { in: day.items.map((i) => i.id) },
      performedAt: { gte: start, lt: end },
    },
    select: { id: true, itemId: true, sets: true, rpe: true, note: true },
  });

  return { program, weekNumber, dayNumber, day, logs };
}

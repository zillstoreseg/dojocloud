'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireTrainer, assertOwnsTrainee, toActionError, AuthzError } from '@/lib/authz';
import { QuotaExceededError } from '@/lib/quota';
import { AiUnavailableError } from '@/lib/ai/client';
import {
  generateProgram,
  generateNutritionPlan,
  workoutProgramSchema,
  nutritionPlanSchema,
  type WorkoutProgramDraft,
  type NutritionPlanDraft,
} from '@/lib/ai/generate';
import { energyTargets, ageFrom } from '@/lib/nutrition';
import { nutritionGoal, nutritionActivity } from '@/lib/training';

export interface DraftResult<T> {
  ok: boolean;
  error?: string;
  draft?: T;
  costUsd?: number;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/**
 * Turns any generation failure into a sentence a coach can act on.
 *
 * Deliberately total: an unrecognised error becomes a generic apology rather
 * than falling through to the raw message. Anthropic's failures arrive as
 * JSON blobs ("401 {"type":"error"...}") that mean nothing to a coach and
 * leak which provider sits behind the feature. The detail is not lost — it is
 * already on the `AiUsage` row, where the admin's AI report can see it.
 */
function aiError(error: unknown): string {
  if (error instanceof AiUnavailableError) {
    return error.reason === 'NO_KEY'
      ? 'مفيش مفتاح AI متسجّل — كلّم إدارة المنصة'
      : 'ميزة التوليد مش متاحة في باقتك';
  }
  if (error instanceof QuotaExceededError) return 'خلص رصيد التوليد بتاع الشهر ده';
  if (error instanceof AuthzError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'بيانات غير صالحة';
  return 'المساعد مقدرش يكمّل دلوقتي — جرّب تاني بعد شوية';
}

/** Everything a draft needs about one trainee, read once. */
async function traineeBrief(trainerId: string, traineeId: string) {
  await assertOwnsTrainee(trainerId, traineeId);

  const trainee = await prisma.trainee.findUnique({
    where: { id: traineeId },
    select: {
      id: true,
      fullName: true,
      gender: true,
      birthDate: true,
      heightCm: true,
      startWeightKg: true,
      goal: true,
      activityLevel: true,
      injuries: true,
      intakes: { orderBy: { submittedAt: 'desc' }, take: 1 },
      measurements: { orderBy: { takenAt: 'desc' }, take: 1, select: { weightKg: true } },
    },
  });
  if (!trainee) return null;

  const intake = trainee.intakes[0];
  const weightKg = Number(
    trainee.measurements[0]?.weightKg ?? intake?.weightKg ?? trainee.startWeightKg ?? 0,
  );
  const heightCm = Number(intake?.heightCm ?? trainee.heightCm ?? 0);
  const birthDate = intake?.birthDate ?? trainee.birthDate;

  const targets =
    weightKg > 0 && heightCm > 0 && birthDate
      ? energyTargets({
          weightKg,
          heightCm,
          age: ageFrom(birthDate),
          sex: (intake?.gender ?? trainee.gender) === 'FEMALE' ? 'FEMALE' : 'MALE',
          activity: nutritionActivity(intake?.activityLevel ?? trainee.activityLevel),
          goal: nutritionGoal(intake?.goal ?? trainee.goal),
        })
      : null;

  return { trainee, intake, weightKg, heightCm, birthDate, targets };
}

const programRequestSchema = z.object({
  traineeId: z.string().min(1, 'اختار متدرب'),
  weeks: z.number().int().min(1).max(12),
});

/**
 * Drafts a program. Nothing is written until the coach accepts it.
 *
 * The exercise library sent to the model is the coach's own plus the public
 * one, capped: a prompt carrying a thousand exercises costs real money to send
 * and makes the choice worse, not better.
 */
export async function draftProgram(
  input: z.input<typeof programRequestSchema>,
): Promise<DraftResult<WorkoutProgramDraft>> {
  try {
    const user = await requireTrainer();
    const data = programRequestSchema.parse(input);

    const brief = await traineeBrief(user.trainerId, data.traineeId);
    if (!brief) return { ok: false, error: 'المتدرب ده مش موجود' };

    const exercises = await prisma.exercise.findMany({
      where: {
        isActive: true,
        OR: [{ trainerId: user.trainerId }, { isPublic: true, trainerId: null }],
      },
      select: { id: true, nameAr: true, muscleGroup: true, equipment: true },
      take: 200,
    });

    if (exercises.length === 0) {
      return { ok: false, error: 'مكتبة التمارين فاضية — ضيف تمارين الأول' };
    }

    const { draft, usage } = await generateProgram({
      trainerId: user.trainerId,
      userId: user.id,
      context: {
        goal: brief.intake?.goal ?? brief.trainee.goal ?? 'GENERAL_HEALTH',
        gender: brief.intake?.gender ?? brief.trainee.gender ?? 'MALE',
        age: brief.birthDate ? ageFrom(brief.birthDate) : null,
        weightKg: brief.weightKg || null,
        heightCm: brief.heightCm || null,
        experienceYears: brief.intake?.previousExperienceYears ?? 0,
        daysPerWeek: brief.intake?.trainingDaysPerWeek ?? 3,
        sessionMinutes: brief.intake?.sessionMinutes ?? 60,
        place: brief.intake?.trainingPlace ?? 'GYM',
        equipment: brief.intake?.equipment ?? [],
        injuries: brief.intake?.injuries ?? (brief.trainee.injuries ? [brief.trainee.injuries] : []),
        weeks: data.weeks,
        library: exercises.map((e) => ({
          id: e.id,
          name: e.nameAr,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
        })),
      },
    });

    return { ok: true, draft, costUsd: usage.costUsd };
  } catch (error) {
    return { ok: false, error: aiError(error) };
  }
}

// The draft is validated separately by its own schema: the AI schemas are Zod
// 4 instances (see `lib/ai/schema.ts`) and cannot be nested inside a Zod 3
// object without both libraries disagreeing about what a schema is.
const saveProgramSchema = z.object({
  traineeId: z.string().min(1),
});

/**
 * Writes an accepted draft.
 *
 * The draft arrives from the browser, so every exercise id in it is verified
 * against what this trainer can actually use before a single row is created.
 * An id the model hallucinated, or one belonging to another coach's library,
 * is dropped rather than trusted — the alternative is a foreign key error at
 * best and a cross-tenant reference at worst.
 */
export async function saveProgramDraft(input: {
  traineeId: string;
  draft: WorkoutProgramDraft;
}): Promise<SaveResult> {
  try {
    const user = await requireTrainer();
    const { traineeId } = saveProgramSchema.parse(input);
    const parsed = workoutProgramSchema.safeParse(input.draft);
    if (!parsed.success) return { ok: false, error: 'المسودة مش مكتملة' };
    const data = { traineeId, draft: parsed.data };

    await assertOwnsTrainee(user.trainerId, data.traineeId);

    const proposed = new Set(
      data.draft.weeks.flatMap((w) => w.days.flatMap((d) => d.items.map((i) => i.exerciseId))),
    );

    const allowed = await prisma.exercise.findMany({
      where: {
        id: { in: [...proposed] },
        isActive: true,
        OR: [{ trainerId: user.trainerId }, { isPublic: true, trainerId: null }],
      },
      select: { id: true },
    });
    const allowedIds = new Set(allowed.map((e) => e.id));

    const program = await prisma.workoutProgram.create({
      data: {
        trainerId: user.trainerId,
        traineeId: data.traineeId,
        name: data.draft.name,
        description: data.draft.description || null,
        weeksCount: data.draft.weeks.length,
        isTemplate: false,
        aiGenerated: true,
        startDate: new Date(),
        weeks: {
          create: data.draft.weeks.map((week, wIndex) => ({
            weekNumber: week.weekNumber || wIndex + 1,
            note: week.note || null,
            days: {
              create: week.days.map((day, dIndex) => ({
                dayNumber: day.dayNumber || dIndex + 1,
                title: day.title || null,
                isRestDay: day.isRestDay,
                items: {
                  create: day.items
                    .filter((item) => allowedIds.has(item.exerciseId))
                    .map((item, order) => ({
                      exerciseId: item.exerciseId,
                      order,
                      sets: item.sets,
                      reps: item.reps,
                      restSec: item.restSec,
                      rpe: item.rpe,
                      note: item.note || null,
                    })),
                },
              })),
            },
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath('/[locale]/dash/programs', 'page');
    return { ok: true, id: program.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as SaveResult;
  }
}

const nutritionRequestSchema = z.object({
  traineeId: z.string().min(1, 'اختار متدرب'),
  calorieTarget: z.number().int().min(800).max(6000).optional().nullable(),
});

/** Drafts a nutrition plan against the trainee's computed or overridden target. */
export async function draftNutritionPlan(
  input: z.input<typeof nutritionRequestSchema>,
): Promise<DraftResult<NutritionPlanDraft>> {
  try {
    const user = await requireTrainer();
    const data = nutritionRequestSchema.parse(input);

    const brief = await traineeBrief(user.trainerId, data.traineeId);
    if (!brief) return { ok: false, error: 'المتدرب ده مش موجود' };
    if (!brief.targets && !data.calorieTarget) {
      return { ok: false, error: 'محتاجين طول ووزن وتاريخ ميلاد المتدرب عشان نحسب هدفه' };
    }

    const calorieTarget = data.calorieTarget ?? brief.targets!.calorieTarget;
    const macros = brief.targets?.macros ?? {
      protein: Math.round((calorieTarget * 0.3) / 4),
      carbs: Math.round((calorieTarget * 0.4) / 4),
      fat: Math.round((calorieTarget * 0.3) / 9),
    };

    const foods = await prisma.foodItem.findMany({
      where: { OR: [{ trainerId: user.trainerId }, { isPublic: true, trainerId: null }] },
      select: { id: true, nameAr: true, kcal: true, protein: true, carbs: true, fat: true },
      take: 200,
    });

    const { draft, usage } = await generateNutritionPlan({
      trainerId: user.trainerId,
      userId: user.id,
      context: {
        goal: brief.intake?.goal ?? brief.trainee.goal ?? 'GENERAL_HEALTH',
        calorieTarget,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        mealsPerDay: brief.intake?.mealsPerDay ?? 3,
        dietPreference: brief.intake?.dietPreference ?? 'NONE',
        allergies: brief.intake?.allergies ?? [],
        dislikedFoods: brief.intake?.dislikedFoods ?? [],
        library: foods.map((f) => ({
          id: f.id,
          name: f.nameAr,
          kcal: Number(f.kcal),
          protein: Number(f.protein),
          carbs: Number(f.carbs),
          fat: Number(f.fat),
        })),
      },
    });

    return { ok: true, draft, costUsd: usage.costUsd };
  } catch (error) {
    return { ok: false, error: aiError(error) };
  }
}

const saveNutritionSchema = z.object({
  traineeId: z.string().min(1),
  calorieTarget: z.number().int().min(0),
  protein: z.number().int().min(0),
  carbs: z.number().int().min(0),
  fat: z.number().int().min(0),
});

/** Writes an accepted nutrition draft, verifying every food id first. */
export async function saveNutritionDraft(input: {
  traineeId: string;
  calorieTarget: number;
  protein: number;
  carbs: number;
  fat: number;
  draft: NutritionPlanDraft;
}): Promise<SaveResult> {
  try {
    const user = await requireTrainer();
    const parsedDraft = nutritionPlanSchema.safeParse(input.draft);
    if (!parsedDraft.success) return { ok: false, error: 'المسودة مش مكتملة' };
    const data = { ...saveNutritionSchema.parse(input), draft: parsedDraft.data };

    await assertOwnsTrainee(user.trainerId, data.traineeId);

    const proposed = data.draft.meals
      .flatMap((m) => m.items.map((i) => i.foodId))
      .filter((id): id is string => Boolean(id));

    const allowed = await prisma.foodItem.findMany({
      where: {
        id: { in: proposed },
        OR: [{ trainerId: user.trainerId }, { isPublic: true, trainerId: null }],
      },
      select: { id: true },
    });
    const allowedIds = new Set(allowed.map((f) => f.id));

    const plan = await prisma.nutritionPlan.create({
      data: {
        trainerId: user.trainerId,
        traineeId: data.traineeId,
        name: data.draft.name,
        description: data.draft.description || null,
        targetKcal: data.calorieTarget,
        targetProtein: data.protein,
        targetCarbs: data.carbs,
        targetFat: data.fat,
        isTemplate: false,
        aiGenerated: true,
        meals: {
          create: data.draft.meals.map((meal, order) => ({
            type: meal.type,
            name: meal.name,
            order,
            timeHint: meal.timeHint || null,
            note: meal.note || null,
            items: {
              create: meal.items.map((item, itemOrder) => ({
                // An unrecognised id becomes a free-text row rather than a
                // failed insert; the name and macros are still useful.
                foodId: item.foodId && allowedIds.has(item.foodId) ? item.foodId : null,
                foodName: item.foodName,
                qty: item.qty,
                unit: item.unit || 'g',
                kcal: item.kcal,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                order: itemOrder,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath('/[locale]/dash/nutrition', 'page');
    return { ok: true, id: plan.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as SaveResult;
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  requireTrainer,
  assertOwns,
  assertOwnsTrainee,
  toActionError,
  AuthzError,
} from '@/lib/authz';

export interface ProgramActionResult {
  ok: boolean;
  error?: string;
  programId?: string;
}

const GOALS = [
  'WEIGHT_LOSS', 'MUSCLE_GAIN', 'RECOMPOSITION', 'STRENGTH',
  'ENDURANCE', 'GENERAL_HEALTH', 'REHAB',
] as const;

const programSchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم البرنامج').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  goal: z.enum(GOALS).optional().nullable(),
  weeksCount: z.number().int().min(1, 'أسبوع واحد على الأقل').max(52),
  traineeId: z.string().optional().nullable(),
  isTemplate: z.boolean(),
});

export type ProgramInput = z.infer<typeof programSchema>;

/**
 * Verifies a program belongs to this trainer, and returns its id.
 *
 * Nested rows (weeks, days, items) carry no `trainerId` of their own, so
 * every mutation on them has to walk back up to the program and check there.
 */
async function assertOwnsDay(trainerId: string, dayId: string): Promise<string> {
  const day = await prisma.workoutDay.findFirst({
    where: { id: dayId, week: { program: { trainerId } } },
    select: { id: true },
  });
  if (!day) throw new AuthzError('Day not found for this trainer', 'NOT_FOUND');
  return day.id;
}

async function assertOwnsItem(trainerId: string, itemId: string): Promise<string> {
  const item = await prisma.workoutItem.findFirst({
    where: { id: itemId, day: { week: { program: { trainerId } } } },
    select: { id: true },
  });
  if (!item) throw new AuthzError('Item not found for this trainer', 'NOT_FOUND');
  return item.id;
}

/**
 * Creates a program with its weeks and days already laid out.
 *
 * A program with no structure is not something a coach can start filling in,
 * so the skeleton is built up front: `weeksCount` weeks of seven days each.
 */
export async function createProgram(input: ProgramInput): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    const data = programSchema.parse(input);
    if (data.traineeId) await assertOwnsTrainee(user.trainerId, data.traineeId);

    const program = await prisma.workoutProgram.create({
      data: {
        trainerId: user.trainerId,
        name: data.name,
        description: data.description || null,
        goal: data.goal ?? null,
        weeksCount: data.weeksCount,
        isTemplate: data.isTemplate,
        traineeId: data.isTemplate ? null : (data.traineeId ?? null),
        weeks: {
          create: Array.from({ length: data.weeksCount }, (_, w) => ({
            weekNumber: w + 1,
            days: {
              create: Array.from({ length: 7 }, (_, d) => ({ dayNumber: d + 1 })),
            },
          })),
        },
      },
    });

    revalidatePath('/[locale]/dash/programs', 'page');
    return { ok: true, programId: program.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as ProgramActionResult;
  }
}

export async function updateProgram(
  input: ProgramInput & { id: string },
): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    const data = programSchema.parse(input);
    await assertOwns('workoutProgram', user.trainerId, input.id);
    if (data.traineeId) await assertOwnsTrainee(user.trainerId, data.traineeId);

    await prisma.workoutProgram.update({
      where: { id: input.id },
      data: {
        name: data.name,
        description: data.description || null,
        goal: data.goal ?? null,
        isTemplate: data.isTemplate,
        traineeId: data.isTemplate ? null : (data.traineeId ?? null),
      },
    });

    revalidatePath('/[locale]/dash/programs', 'page');
    return { ok: true, programId: input.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as ProgramActionResult;
  }
}

export async function deleteProgram(input: { id: string }): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    const result = await prisma.workoutProgram.deleteMany({
      where: { id: input.id, trainerId: user.trainerId },
    });
    if (result.count === 0) return { ok: false, error: 'البرنامج غير موجود' };

    revalidatePath('/[locale]/dash/programs', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as ProgramActionResult;
  }
}

const itemSchema = z.object({
  dayId: z.string().min(1),
  exerciseId: z.string().min(1),
  sets: z.number().int().min(1).max(20).default(3),
  reps: z.string().trim().min(1).max(20).default('10'),
  restSec: z.number().int().min(0).max(600).default(60),
  note: z.string().trim().max(300).optional().or(z.literal('')),
});

export async function addWorkoutItem(
  input: z.infer<typeof itemSchema>,
): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    const data = itemSchema.parse(input);
    await assertOwnsDay(user.trainerId, data.dayId);

    // The exercise must be one this trainer may use: their own, or a public
    // library entry. Anything else would leak another coach's library.
    const exercise = await prisma.exercise.findFirst({
      where: {
        id: data.exerciseId,
        isActive: true,
        OR: [{ trainerId: user.trainerId }, { trainerId: null, isPublic: true }],
      },
      select: { id: true },
    });
    if (!exercise) return { ok: false, error: 'التمرين غير متاح' };

    const last = await prisma.workoutItem.findFirst({
      where: { dayId: data.dayId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    await prisma.workoutItem.create({
      data: {
        dayId: data.dayId,
        exerciseId: data.exerciseId,
        order: (last?.order ?? -1) + 1,
        sets: data.sets,
        reps: data.reps,
        restSec: data.restSec,
        note: data.note || null,
      },
    });

    revalidatePath('/[locale]/dash/programs', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: 'بيانات غير صالحة' };
    return toActionError(error) as ProgramActionResult;
  }
}

export async function updateWorkoutItem(input: {
  id: string;
  sets: number;
  reps: string;
  restSec: number;
  note?: string;
}): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsItem(user.trainerId, input.id);

    await prisma.workoutItem.update({
      where: { id: input.id },
      data: {
        sets: Math.min(20, Math.max(1, input.sets)),
        reps: input.reps.trim().slice(0, 20) || '10',
        restSec: Math.min(600, Math.max(0, input.restSec)),
        note: input.note?.trim() || null,
      },
    });

    revalidatePath('/[locale]/dash/programs', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as ProgramActionResult;
  }
}

export async function deleteWorkoutItem(input: { id: string }): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsItem(user.trainerId, input.id);
    await prisma.workoutItem.delete({ where: { id: input.id } });

    revalidatePath('/[locale]/dash/programs', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as ProgramActionResult;
  }
}

/** Persists a drag-and-drop reorder within one day. */
export async function reorderWorkoutItems(input: {
  dayId: string;
  itemIds: string[];
}): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsDay(user.trainerId, input.dayId);

    // Scoping the update to `dayId` means an id from another day — or another
    // trainer — silently updates nothing rather than being reordered in.
    await prisma.$transaction(
      input.itemIds.map((id, index) =>
        prisma.workoutItem.updateMany({
          where: { id, dayId: input.dayId },
          data: { order: index },
        }),
      ),
    );

    revalidatePath('/[locale]/dash/programs', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as ProgramActionResult;
  }
}

export async function setRestDay(input: {
  dayId: string;
  isRestDay: boolean;
  title?: string;
}): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsDay(user.trainerId, input.dayId);

    await prisma.workoutDay.update({
      where: { id: input.dayId },
      data: {
        isRestDay: input.isRestDay,
        ...(input.title !== undefined ? { title: input.title.trim() || null } : {}),
      },
    });

    revalidatePath('/[locale]/dash/programs', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as ProgramActionResult;
  }
}

/** Duplicates a program, including every week, day and item. */
export async function duplicateProgram(input: {
  id: string;
  asTemplate?: boolean;
}): Promise<ProgramActionResult> {
  try {
    const user = await requireTrainer();
    const source = await prisma.workoutProgram.findFirst({
      where: { id: input.id, trainerId: user.trainerId },
      include: { weeks: { include: { days: { include: { items: true } } } } },
    });
    if (!source) return { ok: false, error: 'البرنامج غير موجود' };

    const copy = await prisma.workoutProgram.create({
      data: {
        trainerId: user.trainerId,
        name: `${source.name} (نسخة)`,
        description: source.description,
        goal: source.goal,
        weeksCount: source.weeksCount,
        isTemplate: input.asTemplate ?? source.isTemplate,
        // A copy starts unassigned: duplicating is how a coach reuses a plan
        // for someone else, not how they clone an assignment.
        traineeId: null,
        weeks: {
          create: source.weeks.map((week) => ({
            weekNumber: week.weekNumber,
            note: week.note,
            days: {
              create: week.days.map((day) => ({
                dayNumber: day.dayNumber,
                title: day.title,
                isRestDay: day.isRestDay,
                note: day.note,
                items: {
                  create: day.items.map((item) => ({
                    exerciseId: item.exerciseId,
                    order: item.order,
                    sets: item.sets,
                    reps: item.reps,
                    restSec: item.restSec,
                    tempo: item.tempo,
                    rpe: item.rpe,
                    note: item.note,
                  })),
                },
              })),
            },
          })),
        },
      },
    });

    revalidatePath('/[locale]/dash/programs', 'page');
    return { ok: true, programId: copy.id };
  } catch (error) {
    return toActionError(error) as ProgramActionResult;
  }
}

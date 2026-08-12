'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireTrainer, assertOwns, toActionError } from '@/lib/authz';
import { assertQuota, QUOTA_KEYS, QuotaExceededError } from '@/lib/quota';

export interface ExerciseActionResult {
  ok: boolean;
  error?: string;
  upgrade?: boolean;
  exerciseId?: string;
}

const MUSCLE_GROUPS = [
  'CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS', 'QUADS',
  'HAMSTRINGS', 'GLUTES', 'CALVES', 'ABS', 'FULL_BODY', 'CARDIO', 'MOBILITY',
] as const;

const EQUIPMENT = [
  'BODYWEIGHT', 'BARBELL', 'DUMBBELL', 'KETTLEBELL', 'MACHINE', 'CABLE',
  'RESISTANCE_BAND', 'SMITH_MACHINE', 'MEDICINE_BALL', 'CARDIO_MACHINE', 'OTHER',
] as const;

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const exerciseSchema = z.object({
  nameAr: z.string().trim().min(2, 'اكتب اسم التمرين بالعربي').max(120),
  nameEn: z.string().trim().min(2, 'اكتب اسم التمرين بالإنجليزي').max(120),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  equipment: z.enum(EQUIPMENT),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  videoUrl: z.string().trim().url('الرابط غير صحيح').max(500).optional().or(z.literal('')),
  instructionsAr: optional(2000),
  instructionsEn: optional(2000),
});

export type ExerciseInput = z.infer<typeof exerciseSchema>;

function toData(data: ExerciseInput) {
  return {
    nameAr: data.nameAr,
    nameEn: data.nameEn,
    muscleGroup: data.muscleGroup,
    equipment: data.equipment,
    difficulty: data.difficulty,
    videoUrl: data.videoUrl || null,
    instructionsAr: data.instructionsAr || null,
    instructionsEn: data.instructionsEn || null,
  };
}

export async function createExercise(input: ExerciseInput): Promise<ExerciseActionResult> {
  try {
    const user = await requireTrainer();
    const data = exerciseSchema.parse(input);
    await assertQuota(user.trainerId, QUOTA_KEYS.EXERCISES);

    const exercise = await prisma.exercise.create({
      // `isPublic` stays false: only the admin curates the shared library.
      data: { ...toData(data), trainerId: user.trainerId, isPublic: false },
    });

    revalidatePath('/[locale]/dash/exercises', 'page');
    return { ok: true, exerciseId: exercise.id };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        upgrade: true,
        error: `وصلت للحد الأقصى للتمارين في خطتك (${error.limit}). رقّي خطتك لإضافة المزيد.`,
      };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as ExerciseActionResult;
  }
}

export async function updateExercise(
  input: ExerciseInput & { id: string },
): Promise<ExerciseActionResult> {
  try {
    const user = await requireTrainer();
    const data = exerciseSchema.parse(input);
    // Only the trainer's own exercises are editable; the shared library is
    // the admin's, and `assertOwns` is what enforces that.
    await assertOwns('exercise', user.trainerId, input.id);

    await prisma.exercise.update({ where: { id: input.id }, data: toData(data) });
    revalidatePath('/[locale]/dash/exercises', 'page');
    return { ok: true, exerciseId: input.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as ExerciseActionResult;
  }
}

export async function deleteExercise(input: { id: string }): Promise<ExerciseActionResult> {
  try {
    const user = await requireTrainer();
    const result = await prisma.exercise.deleteMany({
      where: { id: input.id, trainerId: user.trainerId },
    });
    if (result.count === 0) return { ok: false, error: 'التمرين غير موجود' };

    revalidatePath('/[locale]/dash/exercises', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as ExerciseActionResult;
  }
}

/**
 * Copies an exercise from the shared library into the trainer's own, so they
 * can adjust the cues and video without touching what everyone else sees.
 */
export async function copyFromLibrary(input: { id: string }): Promise<ExerciseActionResult> {
  try {
    const user = await requireTrainer();
    await assertQuota(user.trainerId, QUOTA_KEYS.EXERCISES);

    const source = await prisma.exercise.findFirst({
      where: { id: input.id, isPublic: true, isActive: true },
    });
    if (!source) return { ok: false, error: 'التمرين غير موجود في المكتبة العامة' };

    const copy = await prisma.exercise.create({
      data: {
        trainerId: user.trainerId,
        nameAr: source.nameAr,
        nameEn: source.nameEn,
        muscleGroup: source.muscleGroup,
        equipment: source.equipment,
        difficulty: source.difficulty,
        videoUrl: source.videoUrl,
        imageUrl: source.imageUrl,
        instructionsAr: source.instructionsAr,
        instructionsEn: source.instructionsEn,
        isPublic: false,
      },
    });

    revalidatePath('/[locale]/dash/exercises', 'page');
    return { ok: true, exerciseId: copy.id };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        upgrade: true,
        error: `وصلت للحد الأقصى للتمارين في خطتك (${error.limit}).`,
      };
    }
    return toActionError(error) as ExerciseActionResult;
  }
}

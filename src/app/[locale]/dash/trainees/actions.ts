'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireTrainer, assertOwnsTrainee, toActionError } from '@/lib/authz';
import { assertQuota, QUOTA_KEYS, QuotaExceededError } from '@/lib/quota';
import { syncDirectoryCounters } from '@/lib/directory';
import { audit } from '@/lib/audit';

export interface TraineeActionResult {
  ok: boolean;
  error?: string;
  /** Set when the failure is a plan limit, so the UI can offer an upgrade. */
  upgrade?: boolean;
  traineeId?: string;
}

const GOALS = [
  'WEIGHT_LOSS',
  'MUSCLE_GAIN',
  'RECOMPOSITION',
  'STRENGTH',
  'ENDURANCE',
  'GENERAL_HEALTH',
  'REHAB',
] as const;

const ACTIVITY = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'] as const;

const optionalString = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const traineeSchema = z.object({
  fullName: z.string().trim().min(2, 'اكتب اسم المتدرب').max(120),
  phone: optionalString(20),
  email: z.string().trim().toLowerCase().email('البريد غير صحيح').optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE']).optional().nullable(),
  birthDate: z.string().optional().or(z.literal('')),
  heightCm: z.number().min(80).max(250).optional().nullable(),
  startWeightKg: z.number().min(25).max(400).optional().nullable(),
  goal: z.enum(GOALS).optional().nullable(),
  activityLevel: z.enum(ACTIVITY).optional().nullable(),
  medicalNotes: optionalString(2000),
  injuries: optionalString(2000),
  notes: optionalString(2000),
  renewalDate: z.string().optional().or(z.literal('')),
});

export type TraineeInput = z.infer<typeof traineeSchema>;

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shapes validated input into the columns Prisma expects. */
function toData(data: TraineeInput) {
  return {
    fullName: data.fullName,
    phone: data.phone || null,
    email: data.email || null,
    gender: data.gender ?? null,
    birthDate: toDate(data.birthDate),
    heightCm: data.heightCm ?? null,
    startWeightKg: data.startWeightKg ?? null,
    goal: data.goal ?? null,
    activityLevel: data.activityLevel ?? null,
    medicalNotes: data.medicalNotes || null,
    injuries: data.injuries || null,
    notes: data.notes || null,
    renewalDate: toDate(data.renewalDate),
  };
}

export async function createTrainee(input: TraineeInput): Promise<TraineeActionResult> {
  try {
    const user = await requireTrainer();
    const data = traineeSchema.parse(input);

    // Plan limits are enforced before the write, and a breach is an upgrade
    // prompt rather than an error — the trainer did nothing wrong.
    await assertQuota(user.trainerId, QUOTA_KEYS.TRAINEES);

    const trainee = await prisma.trainee.create({
      // `trainerId` comes from the session, never from the request body.
      data: { ...toData(data), trainerId: user.trainerId },
    });

    await audit({
      actorId: user.id,
      action: 'trainee.create',
      entity: 'Trainee',
      entityId: trainee.id,
      after: { fullName: trainee.fullName },
    });

    // Trainee count is a directory column, so every write that can change
    // it refreshes the coach's row.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/trainees', 'page');
    return { ok: true, traineeId: trainee.id };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        upgrade: true,
        error: `وصلت للحد الأقصى للمتدربين في خطتك (${error.limit}). رقّي خطتك لإضافة المزيد.`,
      };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as TraineeActionResult;
  }
}

export async function updateTrainee(
  input: TraineeInput & { id: string },
): Promise<TraineeActionResult> {
  try {
    const user = await requireTrainer();
    const data = traineeSchema.parse(input);
    // Ownership is asserted before the write, so a guessed id changes nothing.
    await assertOwnsTrainee(user.trainerId, input.id);

    await prisma.trainee.update({ where: { id: input.id }, data: toData(data) });

    await audit({
      actorId: user.id,
      action: 'trainee.update',
      entity: 'Trainee',
      entityId: input.id,
      after: { fullName: data.fullName },
    });

    // Trainee count is a directory column, so every write that can change
    // it refreshes the coach's row.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/trainees', 'page');
    return { ok: true, traineeId: input.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as TraineeActionResult;
  }
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED']),
});

export async function setTraineeStatus(
  input: z.infer<typeof statusSchema>,
): Promise<TraineeActionResult> {
  try {
    const user = await requireTrainer();
    const { id, status } = statusSchema.parse(input);
    await assertOwnsTrainee(user.trainerId, id);

    // Reactivating counts against the plan again, so it is checked like a
    // fresh add — otherwise archiving would be a way around the limit.
    if (status === 'ACTIVE') {
      const current = await prisma.trainee.findUnique({ where: { id }, select: { status: true } });
      if (current?.status !== 'ACTIVE') {
        await assertQuota(user.trainerId, QUOTA_KEYS.TRAINEES);
      }
    }

    await prisma.trainee.update({ where: { id }, data: { status } });
    await audit({
      actorId: user.id,
      action: 'trainee.status',
      entity: 'Trainee',
      entityId: id,
      after: { status },
    });

    // Trainee count is a directory column, so every write that can change
    // it refreshes the coach's row.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/trainees', 'page');
    return { ok: true, traineeId: id };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        upgrade: true,
        error: `وصلت للحد الأقصى للمتدربين النشطين في خطتك (${error.limit}).`,
      };
    }
    return toActionError(error) as TraineeActionResult;
  }
}

export async function deleteTrainee(input: { id: string }): Promise<TraineeActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsTrainee(user.trainerId, input.id);

    // Scoped delete: the `trainerId` in the filter makes a cross-tenant delete
    // impossible even if the ownership check above were ever removed.
    const result = await prisma.trainee.deleteMany({
      where: { id: input.id, trainerId: user.trainerId },
    });
    if (result.count === 0) return { ok: false, error: 'المتدرب غير موجود' };

    await audit({
      actorId: user.id,
      action: 'trainee.delete',
      entity: 'Trainee',
      entityId: input.id,
    });

    // Trainee count is a directory column, so every write that can change
    // it refreshes the coach's row.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/trainees', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as TraineeActionResult;
  }
}

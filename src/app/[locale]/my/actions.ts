'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { toActionError } from '@/lib/authz';
import { uploadFile } from '@/lib/storage';
import { requireTraineeContext, dayRange } from '@/lib/trainee/portal';

export interface TraineeActionResult {
  ok: boolean;
  error?: string;
}

const setSchema = z.object({
  set: z.number().int().min(1).max(20),
  reps: z.number().int().min(0).max(999),
  weightKg: z.number().min(0).max(999).nullable(),
});

const logSchema = z.object({
  itemId: z.string().min(1),
  sets: z.array(setSchema).min(1, 'سجّل مجموعة واحدة على الأقل').max(20),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  note: z.string().trim().max(300).optional(),
});

/**
 * Records what the trainee actually lifted.
 *
 * The exercise is verified to belong to a program written for *this* trainee
 * before anything is written. `itemId` arrives from the browser, so it is the
 * one value here that cannot be trusted, and a trainee logging sets against
 * another coach's program would be a silent cross-tenant write.
 *
 * Logging twice on the same day updates the existing row rather than stacking
 * a second one — a trainee correcting a typo means "I lifted this", not "I did
 * the whole thing again".
 */
export async function logWorkoutItem(
  input: z.input<typeof logSchema>,
): Promise<TraineeActionResult> {
  try {
    const ctx = await requireTraineeContext();
    const data = logSchema.parse(input);

    const item = await prisma.workoutItem.findFirst({
      where: { id: data.itemId, day: { week: { program: { traineeId: ctx.traineeId } } } },
      select: { id: true },
    });
    if (!item) return { ok: false, error: 'التمرين ده مش في برنامجك' };

    const { start, end } = dayRange();
    const existing = await prisma.workoutLog.findFirst({
      where: { traineeId: ctx.traineeId, itemId: item.id, performedAt: { gte: start, lt: end } },
      select: { id: true },
    });

    const payload = {
      sets: data.sets,
      rpe: data.rpe ?? null,
      note: data.note || null,
    };

    if (existing) {
      await prisma.workoutLog.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.workoutLog.create({
        data: { traineeId: ctx.traineeId, itemId: item.id, ...payload },
      });
    }

    revalidatePath('/[locale]/my', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as TraineeActionResult;
  }
}

const measurementSchema = z.object({
  weightKg: z.number().min(20).max(400).nullable().optional(),
  bodyFatPct: z.number().min(1).max(70).nullable().optional(),
  chestCm: z.number().min(30).max(250).nullable().optional(),
  waistCm: z.number().min(30).max(250).nullable().optional(),
  hipsCm: z.number().min(30).max(250).nullable().optional(),
  armCm: z.number().min(10).max(120).nullable().optional(),
  thighCm: z.number().min(20).max(150).nullable().optional(),
  neckCm: z.number().min(20).max(100).nullable().optional(),
  note: z.string().trim().max(300).optional(),
});

/** Adds a weigh-in. Every field is optional; an empty submission is refused. */
export async function addMeasurement(
  input: z.input<typeof measurementSchema>,
): Promise<TraineeActionResult> {
  try {
    const ctx = await requireTraineeContext();
    const data = measurementSchema.parse(input);

    const hasNumber = Object.entries(data).some(
      ([key, value]) => key !== 'note' && typeof value === 'number',
    );
    if (!hasNumber) return { ok: false, error: 'اكتب قياس واحد على الأقل' };

    await prisma.measurement.create({
      data: {
        traineeId: ctx.traineeId,
        weightKg: data.weightKg ?? null,
        bodyFatPct: data.bodyFatPct ?? null,
        chestCm: data.chestCm ?? null,
        waistCm: data.waistCm ?? null,
        hipsCm: data.hipsCm ?? null,
        armCm: data.armCm ?? null,
        thighCm: data.thighCm ?? null,
        neckCm: data.neckCm ?? null,
        note: data.note || null,
      },
    });

    revalidatePath('/[locale]/my/measurements', 'page');
    revalidatePath('/[locale]/my', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as TraineeActionResult;
  }
}

/** Attaches a progress photo to the trainee's latest measurement. */
export async function addProgressPhoto(formData: FormData): Promise<TraineeActionResult> {
  try {
    const ctx = await requireTraineeContext();

    const file = formData.get('photo');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'اختار صورة الأول' };
    }

    const latest = await prisma.measurement.findFirst({
      where: { traineeId: ctx.traineeId },
      orderBy: { takenAt: 'desc' },
      select: { id: true, photos: true },
    });
    if (!latest) return { ok: false, error: 'سجّل قياس الأول عشان تربط الصورة بيه' };

    const stored = await uploadFile(file, `progress/${ctx.traineeId}`, 'image');

    await prisma.measurement.update({
      where: { id: latest.id },
      data: { photos: [...latest.photos, stored.url] },
    });

    revalidatePath('/[locale]/my/measurements', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as TraineeActionResult;
  }
}

/** Uploads a renewal receipt against the trainee's own pending subscription. */
export async function submitRenewalReceipt(formData: FormData): Promise<TraineeActionResult> {
  try {
    const ctx = await requireTraineeContext();

    const subscriptionId = String(formData.get('subscriptionId') ?? '');
    const file = formData.get('receipt');
    const reference = String(formData.get('reference') ?? '').trim();

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'ارفع صورة الوصل' };
    }

    // Scoped to this trainee and to a row still awaiting review, so a receipt
    // can neither be attached to someone else's subscription nor replace one
    // an admin has already acted on.
    const sub = await prisma.traineeSubscription.findFirst({
      where: { id: subscriptionId, traineeId: ctx.traineeId, status: 'PENDING' },
      select: { id: true, receiptUrl: true },
    });
    if (!sub) return { ok: false, error: 'مفيش اشتراك في انتظار الوصل' };

    const stored = await uploadFile(file, `receipts/trainees/${ctx.traineeId}`, 'document');

    await prisma.traineeSubscription.update({
      where: { id: sub.id },
      data: { receiptUrl: stored.url, reference: reference || null },
    });

    revalidatePath('/[locale]/my/subscription', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as TraineeActionResult;
  }
}

/** Marks every unread notification as read. */
export async function markNotificationsRead(): Promise<TraineeActionResult> {
  try {
    const ctx = await requireTraineeContext();
    await prisma.notification.updateMany({
      where: { userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath('/[locale]/my/notifications', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as TraineeActionResult;
  }
}

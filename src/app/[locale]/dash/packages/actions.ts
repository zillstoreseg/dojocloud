'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireTrainer, assertOwns, toActionError } from '@/lib/authz';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { syncDirectoryCounters } from '@/lib/directory';

export interface PackageActionResult {
  ok: boolean;
  error?: string;
  packageId?: string;
}

const packageSchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم الباقة').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  price: z.number().min(0, 'السعر غير صحيح').max(1_000_000),
  currency: z.enum(SUPPORTED_CURRENCIES),
  durationDays: z.number().int().min(1, 'المدة يوم على الأقل').max(3650),
  sessionsCount: z.number().int().min(0).max(1000).optional().nullable(),
  isPublic: z.boolean(),
  isActive: z.boolean(),
});

export type PackageInput = z.infer<typeof packageSchema>;

function toData(data: PackageInput) {
  return {
    name: data.name,
    description: data.description || null,
    price: data.price,
    currency: data.currency,
    durationDays: data.durationDays,
    sessionsCount: data.sessionsCount ?? null,
    isPublic: data.isPublic,
    isActive: data.isActive,
  };
}

export async function createPackage(input: PackageInput): Promise<PackageActionResult> {
  try {
    const user = await requireTrainer();
    const data = packageSchema.parse(input);

    const created = await prisma.trainerPackage.create({
      data: { ...toData(data), trainerId: user.trainerId },
    });

    // "Starting from" in the directory is the cheapest public package.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/packages', 'page');
    return { ok: true, packageId: created.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as PackageActionResult;
  }
}

export async function updatePackage(
  input: PackageInput & { id: string },
): Promise<PackageActionResult> {
  try {
    const user = await requireTrainer();
    const data = packageSchema.parse(input);
    await assertOwns('trainerPackage', user.trainerId, input.id);

    await prisma.trainerPackage.update({ where: { id: input.id }, data: toData(data) });
    // "Starting from" in the directory is the cheapest public package.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/packages', 'page');
    return { ok: true, packageId: input.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as PackageActionResult;
  }
}

export async function deletePackage(input: { id: string }): Promise<PackageActionResult> {
  try {
    const user = await requireTrainer();

    // A package with subscribers is history, not a mistake — deactivate it so
    // existing subscriptions keep their reference instead of losing it.
    const inUse = await prisma.traineeSubscription.count({ where: { packageId: input.id } });
    if (inUse > 0) {
      const result = await prisma.trainerPackage.updateMany({
        where: { id: input.id, trainerId: user.trainerId },
        data: { isActive: false, isPublic: false },
      });
      if (result.count === 0) return { ok: false, error: 'الباقة غير موجودة' };
      // "Starting from" in the directory is the cheapest public package.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/packages', 'page');
      return { ok: true };
    }

    const result = await prisma.trainerPackage.deleteMany({
      where: { id: input.id, trainerId: user.trainerId },
    });
    if (result.count === 0) return { ok: false, error: 'الباقة غير موجودة' };

    // "Starting from" in the directory is the cheapest public package.
    await syncDirectoryCounters(user.trainerId);
    revalidatePath('/[locale]/dash/packages', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PackageActionResult;
  }
}

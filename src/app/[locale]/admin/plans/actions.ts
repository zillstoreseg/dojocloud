'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, toActionError } from '@/lib/authz';
import { audit } from '@/lib/audit';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import type { ActionResult } from '../activations/actions';

export type { ActionResult };

const nullableInt = z
  .union([z.number().int().min(0), z.null()])
  .describe('null means unlimited');

const planSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, 'مفتاح الخطة: حروف إنجليزية صغيرة وأرقام وشرطة فقط'),
  nameAr: z.string().trim().min(2, 'اسم الخطة بالعربية مطلوب'),
  nameEn: z.string().trim().min(2, 'اسم الخطة بالإنجليزية مطلوب'),
  taglineAr: z.string().trim().max(160).optional().or(z.literal('')),
  taglineEn: z.string().trim().max(160).optional().or(z.literal('')),
  prices: z.record(z.string(), z.number().min(0)),
  interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  trialDays: z.number().int().min(0).max(90),
  maxTrainees: nullableInt,
  maxLandingPages: nullableInt,
  maxExercises: nullableInt,
  maxNutritionPlans: nullableInt,
  maxTrainerSeats: z.number().int().min(1).max(100),
  aiCreditsPerCycle: z.number().int().min(0),
  storageMb: z.number().int().min(0),
  commissionPercent: z.number().min(0).max(100),
  highlightsAr: z.array(z.string().trim()).max(12),
  highlightsEn: z.array(z.string().trim()).max(12),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  isPopular: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export type PlanInput = z.infer<typeof planSchema>;

export async function savePlan(input: PlanInput): Promise<ActionResult & { id?: string }> {
  try {
    const admin = await requireAdmin('plans.write');
    const data = planSchema.parse(input);

    // Reject prices in currencies the platform doesn't support.
    for (const currency of Object.keys(data.prices)) {
      if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
        return { ok: false, error: `عملة غير مدعومة: ${currency}` };
      }
    }

    const payload = {
      key: data.key,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      taglineAr: data.taglineAr || null,
      taglineEn: data.taglineEn || null,
      prices: data.prices,
      interval: data.interval,
      trialDays: data.trialDays,
      maxTrainees: data.maxTrainees,
      maxLandingPages: data.maxLandingPages,
      maxExercises: data.maxExercises,
      maxNutritionPlans: data.maxNutritionPlans,
      maxTrainerSeats: data.maxTrainerSeats,
      aiCreditsPerCycle: data.aiCreditsPerCycle,
      storageMb: data.storageMb,
      commissionPercent: data.commissionPercent,
      highlights: {
        ar: data.highlightsAr.filter(Boolean),
        en: data.highlightsEn.filter(Boolean),
      },
      isActive: data.isActive,
      isPublic: data.isPublic,
      isPopular: data.isPopular,
      sortOrder: data.sortOrder,
    };

    const existingByKey = await prisma.plan.findUnique({ where: { key: data.key }, select: { id: true } });
    if (existingByKey && existingByKey.id !== data.id) {
      return { ok: false, error: 'مفتاح الخطة مستخدم بالفعل' };
    }

    let planId: string;
    if (data.id) {
      const before = await prisma.plan.findUnique({ where: { id: data.id } });
      const updated = await prisma.plan.update({ where: { id: data.id }, data: payload });
      planId = updated.id;
      await audit({
        actorId: admin.id,
        action: 'plan.update',
        entity: 'Plan',
        entityId: planId,
        before: before ? { prices: before.prices, maxTrainees: before.maxTrainees, isActive: before.isActive } : undefined,
        after: { prices: payload.prices, maxTrainees: payload.maxTrainees, isActive: payload.isActive },
      });
    } else {
      const created = await prisma.plan.create({ data: payload });
      planId = created.id;
      await audit({ actorId: admin.id, action: 'plan.create', entity: 'Plan', entityId: planId, after: payload });
    }

    // Only one plan may wear the "most popular" ribbon.
    if (data.isPopular) {
      await prisma.plan.updateMany({ where: { id: { not: planId } }, data: { isPopular: false } });
    }

    revalidatePath('/[locale]/admin/plans', 'page');
    revalidatePath('/[locale]', 'page');
    return { ok: true, message: data.id ? 'تم تحديث الخطة' : 'تم إنشاء الخطة', id: planId };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error);
  }
}

export async function deletePlan(input: { id: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('plans.write');

    const subscribers = await prisma.subscription.count({ where: { planId: input.id } });
    if (subscribers > 0) {
      // Deleting would orphan billing history; deactivating is the safe path.
      return {
        ok: false,
        error: `لا يمكن حذف خطة عليها ${subscribers} اشتراك — عطّلها بدلًا من ذلك`,
      };
    }

    await prisma.plan.delete({ where: { id: input.id } });
    await audit({ actorId: admin.id, action: 'plan.delete', entity: 'Plan', entityId: input.id });

    revalidatePath('/[locale]/admin/plans', 'page');
    return { ok: true, message: 'تم حذف الخطة' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setPlanFeature(input: {
  planId: string;
  flagKey: string;
  enabled: boolean;
  limitValue?: number | null;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('plans.write');

    await prisma.planFeature.upsert({
      where: { planId_flagKey: { planId: input.planId, flagKey: input.flagKey } },
      create: {
        planId: input.planId,
        flagKey: input.flagKey,
        enabled: input.enabled,
        limitValue: input.limitValue ?? null,
      },
      update: { enabled: input.enabled, limitValue: input.limitValue ?? null },
    });

    await audit({
      actorId: admin.id,
      action: 'plan.feature.set',
      entity: 'PlanFeature',
      entityId: `${input.planId}:${input.flagKey}`,
      after: { enabled: input.enabled, limitValue: input.limitValue },
    });

    revalidatePath('/[locale]/admin/plans', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

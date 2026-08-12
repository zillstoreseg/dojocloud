'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { MealType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  requireTrainer,
  assertOwns,
  assertOwnsTrainee,
  toActionError,
  AuthzError,
} from '@/lib/authz';
import { assertQuota, QUOTA_KEYS, QuotaExceededError } from '@/lib/quota';
import { decimalToNumber } from '@/lib/money';

export interface NutritionActionResult {
  ok: boolean;
  error?: string;
  upgrade?: boolean;
  planId?: string;
}

const planSchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم النظام').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  traineeId: z.string().optional().nullable(),
  isTemplate: z.boolean(),
  targetKcal: z.number().int().min(0).max(10000).optional().nullable(),
  targetProtein: z.number().int().min(0).max(1000).optional().nullable(),
  targetCarbs: z.number().int().min(0).max(2000).optional().nullable(),
  targetFat: z.number().int().min(0).max(1000).optional().nullable(),
});

export type PlanInput = z.infer<typeof planSchema>;

/** Nested rows carry no `trainerId`, so ownership is checked via the plan. */
async function assertOwnsMeal(trainerId: string, mealId: string): Promise<string> {
  const meal = await prisma.meal.findFirst({
    where: { id: mealId, plan: { trainerId } },
    select: { id: true },
  });
  if (!meal) throw new AuthzError('Meal not found for this trainer', 'NOT_FOUND');
  return meal.id;
}

export async function createNutritionPlan(input: PlanInput): Promise<NutritionActionResult> {
  try {
    const user = await requireTrainer();
    const data = planSchema.parse(input);
    if (data.traineeId) await assertOwnsTrainee(user.trainerId, data.traineeId);
    await assertQuota(user.trainerId, QUOTA_KEYS.NUTRITION_PLANS);

    const plan = await prisma.nutritionPlan.create({
      data: {
        trainerId: user.trainerId,
        name: data.name,
        description: data.description || null,
        isTemplate: data.isTemplate,
        traineeId: data.isTemplate ? null : (data.traineeId ?? null),
        targetKcal: data.targetKcal ?? null,
        targetProtein: data.targetProtein ?? null,
        targetCarbs: data.targetCarbs ?? null,
        targetFat: data.targetFat ?? null,
        // A plan with no meals cannot be filled in, so the usual day's shape
        // is created up front and the coach edits from there.
        meals: {
          create: [
            { type: 'BREAKFAST', name: 'الفطار', order: 0 },
            { type: 'LUNCH', name: 'الغدا', order: 1 },
            { type: 'DINNER', name: 'العشا', order: 2 },
            { type: 'SNACK', name: 'سناك', order: 3 },
          ],
        },
      },
    });

    revalidatePath('/[locale]/dash/nutrition', 'page');
    return { ok: true, planId: plan.id };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        upgrade: true,
        error: `وصلت للحد الأقصى لأنظمة التغذية في خطتك (${error.limit}).`,
      };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as NutritionActionResult;
  }
}

export async function deleteNutritionPlan(input: { id: string }): Promise<NutritionActionResult> {
  try {
    const user = await requireTrainer();
    const result = await prisma.nutritionPlan.deleteMany({
      where: { id: input.id, trainerId: user.trainerId },
    });
    if (result.count === 0) return { ok: false, error: 'النظام غير موجود' };

    revalidatePath('/[locale]/dash/nutrition', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as NutritionActionResult;
  }
}

const addItemSchema = z.object({
  mealId: z.string().min(1),
  foodId: z.string().min(1),
  qty: z.number().min(1).max(5000),
});

/**
 * Adds a food to a meal.
 *
 * Macros are snapshotted onto the row rather than joined at read time: a food
 * whose values are corrected later must not silently rewrite a plan the coach
 * already reviewed and sent.
 */
export async function addMealItem(
  input: z.infer<typeof addItemSchema>,
): Promise<NutritionActionResult> {
  try {
    const user = await requireTrainer();
    const data = addItemSchema.parse(input);
    await assertOwnsMeal(user.trainerId, data.mealId);

    const food = await prisma.foodItem.findFirst({
      where: {
        id: data.foodId,
        OR: [{ trainerId: user.trainerId }, { trainerId: null, isPublic: true }],
      },
    });
    if (!food) return { ok: false, error: 'الصنف غير متاح' };

    const factor = data.qty / decimalToNumber(food.baseQty);
    const last = await prisma.mealItem.findFirst({
      where: { mealId: data.mealId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    await prisma.mealItem.create({
      data: {
        mealId: data.mealId,
        foodId: food.id,
        foodName: food.nameAr,
        qty: data.qty,
        unit: food.unit,
        kcal: Math.round(decimalToNumber(food.kcal) * factor),
        protein: Math.round(decimalToNumber(food.protein) * factor * 10) / 10,
        carbs: Math.round(decimalToNumber(food.carbs) * factor * 10) / 10,
        fat: Math.round(decimalToNumber(food.fat) * factor * 10) / 10,
        order: (last?.order ?? -1) + 1,
      },
    });

    revalidatePath('/[locale]/dash/nutrition', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: 'بيانات غير صالحة' };
    return toActionError(error) as NutritionActionResult;
  }
}

/** Changing the quantity rescales the snapshotted macros from the source food. */
export async function updateMealItemQty(input: {
  id: string;
  qty: number;
}): Promise<NutritionActionResult> {
  try {
    const user = await requireTrainer();

    const item = await prisma.mealItem.findFirst({
      where: { id: input.id, meal: { plan: { trainerId: user.trainerId } } },
      include: { food: true },
    });
    if (!item) return { ok: false, error: 'الصنف غير موجود' };

    const qty = Math.min(5000, Math.max(1, input.qty));

    // Without a linked food there is nothing to rescale from, so the macros
    // are scaled proportionally from the row's own current values instead.
    const ratio = item.food
      ? qty / decimalToNumber(item.food.baseQty)
      : qty / decimalToNumber(item.qty);
    const base = item.food ?? {
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    };

    await prisma.mealItem.update({
      where: { id: input.id },
      data: {
        qty,
        kcal: Math.round(decimalToNumber(base.kcal) * ratio),
        protein: Math.round(decimalToNumber(base.protein) * ratio * 10) / 10,
        carbs: Math.round(decimalToNumber(base.carbs) * ratio * 10) / 10,
        fat: Math.round(decimalToNumber(base.fat) * ratio * 10) / 10,
      },
    });

    revalidatePath('/[locale]/dash/nutrition', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as NutritionActionResult;
  }
}

export async function deleteMealItem(input: { id: string }): Promise<NutritionActionResult> {
  try {
    const user = await requireTrainer();
    const item = await prisma.mealItem.findFirst({
      where: { id: input.id, meal: { plan: { trainerId: user.trainerId } } },
      select: { id: true },
    });
    if (!item) return { ok: false, error: 'الصنف غير موجود' };

    await prisma.mealItem.delete({ where: { id: input.id } });
    revalidatePath('/[locale]/dash/nutrition', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as NutritionActionResult;
  }
}

export async function addMeal(input: {
  planId: string;
  type: MealType;
  name: string;
}): Promise<NutritionActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwns('nutritionPlan', user.trainerId, input.planId);

    const last = await prisma.meal.findFirst({
      where: { planId: input.planId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    await prisma.meal.create({
      data: {
        planId: input.planId,
        type: input.type,
        name: input.name.trim().slice(0, 80) || input.type,
        order: (last?.order ?? -1) + 1,
      },
    });

    revalidatePath('/[locale]/dash/nutrition', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as NutritionActionResult;
  }
}

export async function deleteMeal(input: { id: string }): Promise<NutritionActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsMeal(user.trainerId, input.id);
    await prisma.meal.delete({ where: { id: input.id } });

    revalidatePath('/[locale]/dash/nutrition', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as NutritionActionResult;
  }
}

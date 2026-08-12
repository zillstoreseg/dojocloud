'use server';

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { toActionError, AuthzError } from '@/lib/authz';
import { env } from '@/lib/env';
import { FLAG_KEYS, getFeatureLimit, isFeatureEnabled } from '@/lib/flags';
import { QuotaExceededError } from '@/lib/quota';
import { judgeMeal } from '@/lib/nutrition';
import { nutritionGoal } from '@/lib/training';
import { AiUnavailableError } from '@/lib/ai/client';
import {
  analyzeMeal,
  prepareMealImage,
  rescaleItem,
  totalsOf,
  type FoodScanItem,
} from '@/lib/ai/food-scan';
import { requireTraineeContext, dayBudget, dayRange } from '@/lib/trainee/portal';
import { verdictMessage } from '@/lib/verdict';

export interface ScanResult {
  ok: boolean;
  error?: string;
  scanId?: string;
}

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** The coach's user id and the goal a verdict is judged against. */
async function scanSubject(traineeId: string, trainerId: string) {
  const [coach, trainee] = await Promise.all([
    prisma.trainerProfile.findUnique({ where: { id: trainerId }, select: { userId: true } }),
    prisma.trainee.findUnique({
      where: { id: traineeId },
      select: {
        goal: true,
        intakes: { orderBy: { submittedAt: 'desc' }, take: 1, select: { goal: true } },
      },
    }),
  ]);

  return {
    coachUserId: coach?.userId ?? null,
    goal: nutritionGoal(trainee?.intakes[0]?.goal ?? trainee?.goal),
  };
}

/**
 * Stores the prepared image bytes.
 *
 * Bypasses `uploadFile` deliberately: by this point the picture has already
 * been re-encoded to JPEG and stripped of metadata by `prepareMealImage`, so
 * the incoming `File` and its original type are no longer what gets written.
 */
async function storeBytes(bytes: Buffer, folder: string): Promise<string> {
  const key = `${folder}/${randomUUID()}.jpg`;

  if (env.STORAGE_DRIVER === 's3') {
    const file = new File([new Uint8Array(bytes)], 'meal.jpg', { type: 'image/jpeg' });
    const { uploadFile } = await import('@/lib/storage');
    const stored = await uploadFile(file, folder, 'image');
    return stored.url;
  }

  const target = path.join(process.cwd(), 'public', 'uploads', key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return `/uploads/${key}`;
}

/** How many scans this trainee has left today. */
export async function scanAllowance(): Promise<{
  enabled: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}> {
  const ctx = await requireTraineeContext();
  const { coachUserId } = await scanSubject(ctx.traineeId, ctx.trainerId);

  if (!coachUserId) return { enabled: false, used: 0, limit: 0, remaining: 0 };

  const [enabled, limit] = await Promise.all([
    isFeatureEnabled(coachUserId, FLAG_KEYS.AI_FOOD_SCAN),
    getFeatureLimit(coachUserId, FLAG_KEYS.AI_FOOD_SCAN_DAILY),
  ]);

  const { start, end } = dayRange();
  const used = await prisma.foodScan.count({
    where: { traineeId: ctx.traineeId, status: 'DONE', createdAt: { gte: start, lt: end } },
  });

  return {
    enabled,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

/**
 * Reads a photographed meal and judges it.
 *
 * Three separate gates run before a single token is spent: the coach's feature
 * flag, the per-trainee daily limit, and the coach's monthly AI quota inside
 * `runAi`. The daily limit exists because the coach pays per call and a trainee
 * with a camera can otherwise drain a month's credits in an afternoon.
 *
 * A failed reading is still written as a `FAILED` row. Silently dropping it
 * would leave the trainee looking at nothing and the admin's failure rate
 * looking perfect.
 */
export async function scanMeal(formData: FormData): Promise<ScanResult> {
  let scanId: string | null = null;

  try {
    const ctx = await requireTraineeContext();
    const file = formData.get('photo');
    const mealType = String(formData.get('mealType') ?? '') || null;

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'صوّر وجبتك الأول' };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: 'الصورة كبيرة أوي — جرّب صورة أصغر' };
    }
    if (file.type && !ACCEPTED.includes(file.type)) {
      return { ok: false, error: 'نوع الصورة ده مش مدعوم' };
    }

    const { coachUserId, goal } = await scanSubject(ctx.traineeId, ctx.trainerId);
    if (!coachUserId) return { ok: false, error: 'حساب المدرب غير متاح' };

    const allowance = await scanAllowance();
    if (!allowance.enabled) {
      return { ok: false, error: 'الميزة دي مش متاحة في باقة مدربك' };
    }
    if (allowance.remaining !== null && allowance.remaining <= 0) {
      return {
        ok: false,
        error: `وصلت الحد اليومي (${allowance.limit} صور). جرّب تاني بكرة.`,
      };
    }

    // Resize and strip metadata before anything is stored or sent. The photo
    // that leaves this machine is not the one the phone took.
    const original = Buffer.from(await file.arrayBuffer());
    const prepared = await prepareMealImage(original);

    const [imageUrl, thumbUrl] = await Promise.all([
      storeBytes(prepared.full, `meals/${ctx.traineeId}`),
      storeBytes(prepared.thumb, `meals/${ctx.traineeId}/thumbs`),
    ]);

    const budget = await dayBudget(ctx);

    const scan = await prisma.foodScan.create({
      data: {
        traineeId: ctx.traineeId,
        trainerId: ctx.trainerId,
        imageUrl,
        thumbUrl,
        status: 'PENDING',
        mealType: (mealType as never) || null,
        calorieBudgetAtScan: budget.target,
        consumedBeforeScan: budget.consumed,
        nutritionPlanId: budget.nutritionPlanId,
      },
      select: { id: true },
    });
    scanId = scan.id;

    const { reading, usage } = await analyzeMeal({
      trainerId: ctx.trainerId,
      userId: ctx.userId,
      coachUserId,
      image: prepared.full,
      mediaType: 'image/jpeg',
      avoid: ctx.avoidFoods.slice(0, 20),
    });

    if (!reading.isFood || reading.items.length === 0) {
      await prisma.foodScan.update({
        where: { id: scan.id },
        data: {
          status: 'FAILED',
          aiUsageId: usage.usageId,
          errorMessage: 'NOT_FOOD',
        },
      });
      return { ok: false, error: 'مش شايف أكل في الصورة دي — جرّب صورة أوضح' };
    }

    const totals = totalsOf(reading.items);
    const verdict = judgeMeal({
      mealCalories: totals.kcal,
      dailyTarget: budget.target,
      consumedToday: budget.consumed,
      mealsPerDay: budget.mealsPerDay,
      goal,
      hasExcludedItem: hasExcluded(reading.items, ctx.avoidFoods),
    });

    const message = verdictMessage(verdict, goal, totals.kcal);

    await prisma.foodScan.update({
      where: { id: scan.id },
      data: {
        status: 'DONE',
        title: reading.titleAr,
        items: reading.items,
        kcal: totals.kcal,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        confidence: totals.confidence,
        verdict: verdict.verdict,
        verdictReasonAr: message.ar,
        verdictReasonEn: message.en,
        aiUsageId: usage.usageId,
      },
    });

    revalidatePath('/[locale]/my/scan', 'page');
    revalidatePath('/[locale]/my', 'page');
    return { ok: true, scanId: scan.id };
  } catch (error) {
    if (scanId) {
      await prisma.foodScan
        .update({
          where: { id: scanId },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'Unknown',
          },
        })
        .catch(() => undefined);
    }

    if (error instanceof AiUnavailableError) {
      return { ok: false, error: 'خدمة التحليل مش متاحة دلوقتي — كلّم مدربك' };
    }
    if (error instanceof QuotaExceededError) {
      return { ok: false, error: 'رصيد التحليل بتاع مدربك خلص الشهر ده' };
    }
    if (error instanceof AuthzError) return { ok: false, error: error.message };

    // Anything else is a provider or infrastructure failure. The trainee gets a
    // sentence; the detail is already on the FAILED scan row and the AiUsage
    // row, which is where an admin can act on it. Passing the raw message
    // through would show them a JSON error blob from Anthropic.
    return { ok: false, error: 'مقدرناش نحلل الصورة دي — جرّب تاني بعد شوية' };
  }
}

/** Fuzzy containment both ways, so "أرز أبيض" matches a coach's "أرز". */
function hasExcluded(items: FoodScanItem[], avoid: string[]): boolean {
  if (!avoid.length) return false;
  const needles = avoid.map((a) => a.trim().toLowerCase()).filter((a) => a.length >= 2);

  return items.some((item) => {
    const haystack = `${item.nameAr} ${item.nameEn}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle) || needle.includes(haystack));
  });
}

const correctionSchema = z.object({
  scanId: z.string().min(1),
  grams: z.array(z.number().min(0).max(5000)),
});

/**
 * Re-scales a scan after the trainee corrects the portions.
 *
 * No second AI call: the macros of a known food scale linearly with its
 * weight, so correcting 150g of rice to 250g is multiplication, and paying
 * Anthropic to do multiplication would be indefensible. The verdict is
 * recomputed from the new totals, which is the whole reason the verdict lives
 * in code.
 */
export async function correctScan(input: z.input<typeof correctionSchema>): Promise<ScanResult> {
  try {
    const ctx = await requireTraineeContext();
    const data = correctionSchema.parse(input);

    const scan = await prisma.foodScan.findFirst({
      where: { id: data.scanId, traineeId: ctx.traineeId, status: 'DONE' },
      select: {
        id: true,
        items: true,
        loggedAt: true,
        calorieBudgetAtScan: true,
        consumedBeforeScan: true,
      },
    });
    if (!scan) return { ok: false, error: 'التحليل ده مش موجود' };

    const items = (scan.items as unknown as FoodScanItem[]) ?? [];
    if (data.grams.length !== items.length) {
      return { ok: false, error: 'البيانات مش متطابقة' };
    }

    const corrected = items.map((item, index) => rescaleItem(item, data.grams[index]!));
    const totals = totalsOf(corrected);

    const { goal } = await scanSubject(ctx.traineeId, ctx.trainerId);
    const budget = await dayBudget(ctx);

    // Judge against the budget as it stood before this meal. If the scan is
    // already logged, its own calories are inside `budget.consumed` and would
    // otherwise be counted twice.
    const consumedBefore = scan.loggedAt
      ? (scan.consumedBeforeScan ?? budget.consumed)
      : budget.consumed;

    const verdict = judgeMeal({
      mealCalories: totals.kcal,
      dailyTarget: scan.calorieBudgetAtScan || budget.target,
      consumedToday: consumedBefore,
      mealsPerDay: budget.mealsPerDay,
      goal,
      hasExcludedItem: hasExcluded(corrected, ctx.avoidFoods),
    });

    const message = verdictMessage(verdict, goal, totals.kcal);

    await prisma.foodScan.update({
      where: { id: scan.id },
      data: {
        items: corrected,
        kcal: totals.kcal,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        verdict: verdict.verdict,
        verdictReasonAr: message.ar,
        verdictReasonEn: message.en,
      },
    });

    revalidatePath('/[locale]/my/scan', 'page');
    revalidatePath('/[locale]/my', 'page');
    return { ok: true, scanId: scan.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as ScanResult;
  }
}

/** Counts a scan against today, or takes it back out. */
export async function toggleScanLogged(scanId: string, logged: boolean): Promise<ScanResult> {
  try {
    const ctx = await requireTraineeContext();

    const scan = await prisma.foodScan.findFirst({
      where: { id: scanId, traineeId: ctx.traineeId, status: 'DONE' },
      select: { id: true },
    });
    if (!scan) return { ok: false, error: 'التحليل ده مش موجود' };

    await prisma.foodScan.update({
      where: { id: scan.id },
      data: { loggedAt: logged ? new Date() : null },
    });

    revalidatePath('/[locale]/my/scan', 'page');
    revalidatePath('/[locale]/my', 'page');
    return { ok: true, scanId: scan.id };
  } catch (error) {
    return toActionError(error) as ScanResult;
  }
}

/** Flags a wrong reading so the admin's review queue can measure the failure. */
export async function reportScan(scanId: string): Promise<ScanResult> {
  try {
    const ctx = await requireTraineeContext();
    const updated = await prisma.foodScan.updateMany({
      where: { id: scanId, traineeId: ctx.traineeId },
      data: { reportedAt: new Date() },
    });
    if (updated.count === 0) return { ok: false, error: 'التحليل ده مش موجود' };

    revalidatePath('/[locale]/my/scan', 'page');
    return { ok: true, scanId };
  } catch (error) {
    return toActionError(error) as ScanResult;
  }
}

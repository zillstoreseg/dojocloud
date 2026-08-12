'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/audit';
import { uploadFile, UploadError } from '@/lib/storage';
import { energyTargets, ageFrom } from '@/lib/nutrition';
import { nutritionGoal, nutritionActivity } from '@/lib/training';
import { syncDirectoryCounters } from '@/lib/directory';
import { decimalToNumber } from '@/lib/money';
import { intakeSchema, type IntakeInput } from './schema';

export interface JoinResult {
  ok: boolean;
  error?: string;
  traineeId?: string;
  subscriptionId?: string;
}

const joinSchema = z.object({
  username: z.string().trim().min(1).max(40),
  packageId: z.string().min(1),
  intake: intakeSchema,
});

/**
 * A stranger subscribing to a coach.
 *
 * Everything is derived server-side from the public username and the package
 * id: the price is read from the package row rather than accepted from the
 * form, the trainer comes from the handle, and the calorie targets are
 * computed here from the answers rather than trusted from the client. The
 * result is a PENDING subscription that an admin activates once the receipt
 * checks out — the same review queue the trainer's own payments go through.
 */
export async function submitJoin(input: {
  username: string;
  packageId: string;
  intake: IntakeInput;
}): Promise<JoinResult> {
  try {
    const data = joinSchema.parse(input);

    const trainer = await prisma.trainerProfile.findFirst({
      where: { username: data.username.toLowerCase(), approvalStatus: 'APPROVED' },
      select: { id: true, userId: true, fullName: true },
    });
    if (!trainer) return { ok: false, error: 'المدرب غير متاح' };

    const pkg = await prisma.trainerPackage.findFirst({
      where: { id: data.packageId, trainerId: trainer.id, isActive: true, isPublic: true },
    });
    if (!pkg) return { ok: false, error: 'الباقة غير متاحة' };

    const intake = data.intake;
    const birthDate = new Date(intake.birthDate);

    // The plan the coach writes has to be explainable later, so the targets are
    // computed once, here, and stored with the answers that produced them.
    const targets = energyTargets({
      weightKg: intake.weightKg,
      heightCm: intake.heightCm,
      age: ageFrom(birthDate),
      sex: intake.gender,
      activity: nutritionActivity(intake.activityLevel),
      goal: nutritionGoal(intake.goal),
    });

    const result = await prisma.$transaction(async (tx) => {
      const trainee = await tx.trainee.create({
        data: {
          trainerId: trainer.id,
          fullName: intake.fullName,
          phone: intake.phone,
          email: intake.email || null,
          gender: intake.gender,
          birthDate,
          heightCm: intake.heightCm,
          startWeightKg: intake.weightKg,
          goal: intake.goal,
          activityLevel: intake.activityLevel,
          injuries: intake.injuries.length ? intake.injuries.join('، ') : null,
          medicalNotes: intake.medicalConditions.length
            ? intake.medicalConditions.join('، ')
            : null,
          notes: intake.notes || null,
          // Not active until the payment is approved; until then they are a
          // pending row the coach can see but has not been paid for.
          status: 'PAUSED',
        },
        select: { id: true },
      });

      await tx.traineeIntake.create({
        data: {
          traineeId: trainee.id,
          version: 1,
          goal: intake.goal,
          targetWeightKg: intake.targetWeightKg ?? null,
          weightKg: intake.weightKg,
          heightCm: intake.heightCm,
          gender: intake.gender,
          birthDate,
          activityLevel: intake.activityLevel,
          isAthlete: intake.isAthlete ?? false,
          sportType: intake.sportType || null,
          sportLevel: intake.sportLevel ?? null,
          trainingDaysPerWeek: intake.trainingDaysPerWeek,
          sessionMinutes: intake.sessionMinutes,
          trainingPlace: intake.trainingPlace,
          equipment: intake.equipment ?? [],
          previousExperienceYears: intake.previousExperienceYears ?? 0,
          injuries: intake.injuries,
          medicalConditions: intake.medicalConditions,
          medications: intake.medications || null,
          allergies: intake.allergies,
          dietPreference: intake.dietPreference ?? 'NONE',
          dislikedFoods: intake.dislikedFoods,
          mealsPerDay: intake.mealsPerDay,
          sleepHours: intake.sleepHours,
          waterLiters: intake.waterLiters ?? null,
          smokes: intake.smokes ?? false,
          workSchedule: intake.workSchedule || null,
          stressLevel: intake.stressLevel,
          notes: intake.notes || null,
          bmi: targets.bmi,
          bmr: targets.bmr,
          tdee: targets.tdee,
          calorieTarget: targets.calorieTarget,
          proteinG: targets.macros.protein,
          carbsG: targets.macros.carbs,
          fatG: targets.macros.fat,
        },
      });

      const subscription = await tx.traineeSubscription.create({
        data: {
          traineeId: trainee.id,
          packageId: pkg.id,
          // Price from the row, never from the request.
          amount: pkg.price,
          currency: pkg.currency,
          status: 'PENDING',
        },
        select: { id: true },
      });

      return { traineeId: trainee.id, subscriptionId: subscription.id };
    });

    await notify({
      userId: trainer.userId,
      type: 'NEW_TRAINEE',
      titleAr: 'متدرب جديد اشترك معاك',
      titleEn: 'A new trainee subscribed',
      bodyAr: `${intake.fullName} اشترك في ${pkg.name} — في انتظار تأكيد الدفع.`,
      bodyEn: `${intake.fullName} joined ${pkg.name} — awaiting payment confirmation.`,
      link: '/dash/trainees',
    });

    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return { ok: false, error: 'حصل خطأ، جرّب تاني' };
  }
}

const RECEIPT_LIMIT = { max: 6, windowMs: 60 * 60 * 1000 };
const recent = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < RECEIPT_LIMIT.windowMs);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > RECEIPT_LIMIT.max;
}

/**
 * Attaches the transfer receipt to a pending subscription.
 *
 * Signed out by design — the person who just filled the form has no account
 * yet — so the subscription id is the only credential, and it is only usable
 * while the row is still PENDING and has no receipt. Once a receipt is on it,
 * this stops working, which bounds what a guessed id could do.
 */
export async function attachReceipt(input: {
  subscriptionId: string;
  file: FormData;
}): Promise<JoinResult> {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'local';
    if (rateLimited(ip)) return { ok: false, error: 'حاولت كتير، استنى شوية' };

    const sub = await prisma.traineeSubscription.findFirst({
      where: { id: input.subscriptionId, status: 'PENDING', receiptUrl: null },
      select: {
        id: true,
        amount: true,
        currency: true,
        trainee: { select: { id: true, fullName: true, trainerId: true } },
        package: { select: { name: true } },
      },
    });
    if (!sub) return { ok: false, error: 'الطلب مش موجود أو اتسجّل قبل كده' };

    const file = input.file.get('receipt');
    if (!(file instanceof File)) return { ok: false, error: 'ارفع صورة الوصل' };

    const stored = await uploadFile(file, `receipts/trainee/${sub.trainee.trainerId}`, 'image');

    await prisma.traineeSubscription.update({
      where: { id: sub.id },
      data: { receiptUrl: stored.url, reference: input.file.get('reference')?.toString() || null },
    });

    // Admins review these in the activations centre; there is no separate queue.
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        notify({
          userId: admin.id,
          type: 'SYSTEM',
          titleAr: 'وصل اشتراك متدرب للمراجعة',
          titleEn: 'A trainee receipt needs review',
          bodyAr: `${sub.trainee.fullName} — ${sub.package.name} — ${decimalToNumber(sub.amount)} ${sub.currency}`,
          bodyEn: `${sub.trainee.fullName} — ${sub.package.name} — ${decimalToNumber(sub.amount)} ${sub.currency}`,
          link: '/admin/activations?tab=trainee-subscriptions',
        }),
      ),
    );

    await syncDirectoryCounters(sub.trainee.trainerId);

    return { ok: true, traineeId: sub.trainee.id, subscriptionId: sub.id };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: 'حصل خطأ في رفع الوصل' };
  }
}

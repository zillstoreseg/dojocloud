'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, toActionError } from '@/lib/authz';
import { audit, notify } from '@/lib/audit';
import { addInterval } from '@/lib/utils';
import { resetCounters } from '@/lib/quota';
import { decimalToNumber } from '@/lib/money';

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const idSchema = z.object({ id: z.string().min(1) });
const rejectSchema = idSchema.extend({ reason: z.string().trim().min(3, 'اكتب سبب الرفض') });

// ────────────────────────────────────────────────── trainer approval ──────

export async function approveTrainer(input: { id: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('approvals.trainers');
    const { id } = idSchema.parse(input);

    const trainer = await prisma.trainerProfile.findUnique({
      where: { id },
      select: { id: true, userId: true, fullName: true, approvalStatus: true },
    });
    if (!trainer) return { ok: false, error: 'المدرب غير موجود' };

    await prisma.$transaction([
      prisma.trainerProfile.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          approvedAt: new Date(),
          approvedById: admin.id,
          rejectionReason: null,
        },
      }),
      // Approving the account approves its pending certificates in one step;
      // a certificate can still be rejected individually before this.
      prisma.certificate.updateMany({
        where: { trainerId: id, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: admin.id },
      }),
      prisma.user.update({ where: { id: trainer.userId }, data: { status: 'ACTIVE' } }),
    ]);

    await Promise.all([
      audit({
        actorId: admin.id,
        action: 'trainer.approve',
        entity: 'TrainerProfile',
        entityId: id,
        before: { approvalStatus: trainer.approvalStatus },
        after: { approvalStatus: 'APPROVED' },
      }),
      notify({
        userId: trainer.userId,
        type: 'ACCOUNT_APPROVED',
        titleAr: 'تم اعتماد حسابك 🎉',
        titleEn: 'Your account is approved 🎉',
        bodyAr: 'تمت مراجعة شهاداتك واعتماد حسابك. اختر خطتك وابدأ في إضافة متدربيك.',
        bodyEn: 'Your certificates were reviewed and your account approved. Choose a plan and start adding trainees.',
        link: '/dash',
      }),
    ]);

    revalidatePath('/[locale]/admin/activations', 'page');
    return { ok: true, message: `تم اعتماد ${trainer.fullName}` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function rejectTrainer(input: { id: string; reason: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('approvals.trainers');
    const { id, reason } = rejectSchema.parse(input);

    const trainer = await prisma.trainerProfile.findUnique({
      where: { id },
      select: { userId: true, fullName: true },
    });
    if (!trainer) return { ok: false, error: 'المدرب غير موجود' };

    await prisma.trainerProfile.update({
      where: { id },
      data: { approvalStatus: 'REJECTED', rejectionReason: reason, approvedById: admin.id },
    });

    await Promise.all([
      audit({ actorId: admin.id, action: 'trainer.reject', entity: 'TrainerProfile', entityId: id, after: { reason } }),
      notify({
        userId: trainer.userId,
        type: 'ACCOUNT_REJECTED',
        titleAr: 'لم يتم اعتماد حسابك',
        titleEn: 'Your account was not approved',
        bodyAr: reason,
        bodyEn: reason,
        link: '/onboarding/pending',
      }),
    ]);

    revalidatePath('/[locale]/admin/activations', 'page');
    return { ok: true, message: `تم رفض ${trainer.fullName}` };
  } catch (error) {
    return toActionError(error);
  }
}

// ───────────────────────────────────────────────── certificate review ─────

export async function reviewCertificate(input: {
  id: string;
  approve: boolean;
  note?: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('approvals.certificates');
    const { id } = idSchema.parse(input);

    const certificate = await prisma.certificate.findUnique({
      where: { id },
      select: { title: true, trainer: { select: { userId: true } } },
    });
    if (!certificate) return { ok: false, error: 'الشهادة غير موجودة' };

    await prisma.certificate.update({
      where: { id },
      data: {
        status: input.approve ? 'APPROVED' : 'REJECTED',
        reviewNote: input.note,
        reviewedAt: new Date(),
        reviewedById: admin.id,
      },
    });

    await Promise.all([
      audit({
        actorId: admin.id,
        action: input.approve ? 'certificate.approve' : 'certificate.reject',
        entity: 'Certificate',
        entityId: id,
        after: { note: input.note },
      }),
      notify({
        userId: certificate.trainer.userId,
        type: 'CERTIFICATE_REVIEWED',
        titleAr: input.approve ? 'تم اعتماد شهادتك' : 'تم رفض شهادتك',
        titleEn: input.approve ? 'Certificate approved' : 'Certificate rejected',
        bodyAr: `${certificate.title}${input.note ? ` — ${input.note}` : ''}`,
        bodyEn: `${certificate.title}${input.note ? ` — ${input.note}` : ''}`,
      }),
    ]);

    revalidatePath('/[locale]/admin/activations', 'page');
    return { ok: true, message: input.approve ? 'تم اعتماد الشهادة' : 'تم رفض الشهادة' };
  } catch (error) {
    return toActionError(error);
  }
}

// ────────────────────────────────────────────────── payment activation ────

/**
 * Approving a payment is what actually starts a billing cycle: it flips the
 * subscription to ACTIVE, computes `endsAt` from the plan interval, and resets
 * the metered counters so the trainer's AI credits refill.
 */
export async function approvePayment(input: { id: string; note?: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('approvals.payments');
    const { id } = idSchema.parse(input);

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        subscription: {
          include: {
            plan: { select: { interval: true, trialDays: true } },
            trainer: { select: { userId: true, fullName: true } },
          },
        },
      },
    });
    if (!payment) return { ok: false, error: 'الدفعة غير موجودة' };
    if (payment.status === 'APPROVED') return { ok: false, error: 'تم تفعيل هذه الدفعة من قبل' };

    const now = new Date();
    const sub = payment.subscription;
    // Renewing before expiry extends from the current end date, so the trainer
    // never loses paid days by paying early.
    const startsAt = sub.endsAt && sub.endsAt > now ? sub.endsAt : now;
    const endsAt = addInterval(startsAt, sub.plan.interval);

    await prisma.$transaction([
      prisma.payment.update({
        where: { id },
        data: { status: 'APPROVED', reviewedAt: now, reviewedById: admin.id, adminNote: input.note },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'ACTIVE', startsAt: sub.startsAt ?? now, endsAt },
      }),
    ]);

    await resetCounters(sub.id, startsAt, endsAt);

    await Promise.all([
      audit({
        actorId: admin.id,
        action: 'payment.approve',
        entity: 'Payment',
        entityId: id,
        before: { status: payment.status },
        after: { status: 'APPROVED', subscriptionEndsAt: endsAt, amount: decimalToNumber(payment.amount) },
      }),
      notify({
        userId: sub.trainer.userId,
        type: 'PAYMENT_APPROVED',
        titleAr: 'تم تفعيل اشتراكك ✅',
        titleEn: 'Your subscription is active ✅',
        bodyAr: `اشتراكك فعّال حتى ${endsAt.toLocaleDateString('ar-EG')}`,
        bodyEn: `Your subscription is active until ${endsAt.toLocaleDateString('en-US')}`,
        link: '/dash',
      }),
    ]);

    revalidatePath('/[locale]/admin/activations', 'page');
    return { ok: true, message: `تم تفعيل اشتراك ${sub.trainer.fullName}` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function rejectPayment(input: { id: string; reason: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('approvals.payments');
    const { id, reason } = rejectSchema.parse(input);

    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { subscription: { select: { id: true, trainer: { select: { userId: true } } } } },
    });
    if (!payment) return { ok: false, error: 'الدفعة غير موجودة' };

    await prisma.$transaction([
      prisma.payment.update({
        where: { id },
        data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: admin.id, adminNote: reason },
      }),
      // Send the trainer back to the payment step rather than leaving the
      // subscription stuck in review.
      prisma.subscription.update({
        where: { id: payment.subscription.id },
        data: { status: 'PENDING_PAYMENT' },
      }),
    ]);

    await Promise.all([
      audit({ actorId: admin.id, action: 'payment.reject', entity: 'Payment', entityId: id, after: { reason } }),
      notify({
        userId: payment.subscription.trainer.userId,
        type: 'PAYMENT_REJECTED',
        titleAr: 'لم يتم قبول إيصال الدفع',
        titleEn: 'Payment receipt not accepted',
        bodyAr: reason,
        bodyEn: reason,
        link: '/dash/billing',
      }),
    ]);

    revalidatePath('/[locale]/admin/activations', 'page');
    return { ok: true, message: 'تم رفض الدفعة' };
  } catch (error) {
    return toActionError(error);
  }
}

// ──────────────────────────────────────── trainee subscription review ─────

export async function reviewTraineeSubscription(input: {
  id: string;
  approve: boolean;
  note?: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('approvals.payments');
    const { id } = idSchema.parse(input);

    const sub = await prisma.traineeSubscription.findUnique({
      where: { id },
      include: {
        package: { select: { durationDays: true, name: true } },
        trainee: { select: { id: true, fullName: true, userId: true, trainerId: true } },
      },
    });
    if (!sub) return { ok: false, error: 'الاشتراك غير موجود' };

    if (!input.approve) {
      await prisma.traineeSubscription.update({
        where: { id },
        data: { status: 'REJECTED', approvedById: admin.id, approvedAt: new Date(), adminNote: input.note },
      });
      revalidatePath('/[locale]/admin/activations', 'page');
      return { ok: true, message: 'تم رفض اشتراك المتدرب' };
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + sub.package.durationDays * 864e5);

    // The platform's cut is taken from the trainer's current plan.
    const trainerSub = await prisma.subscription.findFirst({
      where: { trainerId: sub.trainee.trainerId, status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { plan: { select: { commissionPercent: true } } },
    });
    const commissionPercent = decimalToNumber(trainerSub?.plan.commissionPercent ?? 0);
    const commissionAmount = (decimalToNumber(sub.amount) * commissionPercent) / 100;

    await prisma.$transaction([
      prisma.traineeSubscription.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: admin.id,
          approvedAt: now,
          startsAt: now,
          endsAt,
          commissionAmount,
          adminNote: input.note,
        },
      }),
      prisma.trainee.update({
        where: { id: sub.trainee.id },
        data: { status: 'ACTIVE', renewalDate: endsAt },
      }),
    ]);

    if (sub.trainee.userId) {
      await notify({
        userId: sub.trainee.userId,
        type: 'PAYMENT_APPROVED',
        titleAr: 'تم تفعيل اشتراكك',
        titleEn: 'Your subscription is active',
        bodyAr: `باقة ${sub.package.name} — حتى ${endsAt.toLocaleDateString('ar-EG')}`,
        bodyEn: `${sub.package.name} — until ${endsAt.toLocaleDateString('en-US')}`,
        link: '/my',
      });
    }

    await audit({
      actorId: admin.id,
      action: 'traineeSubscription.approve',
      entity: 'TraineeSubscription',
      entityId: id,
      after: { endsAt, commissionAmount },
    });

    revalidatePath('/[locale]/admin/activations', 'page');
    return { ok: true, message: `تم تفعيل اشتراك ${sub.trainee.fullName}` };
  } catch (error) {
    return toActionError(error);
  }
}

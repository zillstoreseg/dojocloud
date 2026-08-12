'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireTrainer, isApprovedTrainer, toActionError } from '@/lib/authz';
import { audit, notify } from '@/lib/audit';
import { uploadFile, UploadError } from '@/lib/storage';
import { resetCounters } from '@/lib/quota';
import { planPrice, SUPPORTED_CURRENCIES } from '@/lib/money';
import { checkCoupon, priceAfterCoupon, trialCycle, COUPON_MESSAGES } from '@/lib/billing';

export interface PlanActionResult {
  ok: boolean;
  error?: string;
  /** Where the client should go next. */
  next?: string;
  subscriptionId?: string;
}

const currencySchema = z.enum(SUPPORTED_CURRENCIES);

const selectPlanSchema = z.object({
  planId: z.string().min(1),
  currency: currencySchema,
  couponCode: z.string().trim().max(40).optional().or(z.literal('')),
});

/**
 * Turns a chosen plan into a subscription.
 *
 * A free trial starts immediately — asking someone to "pay" zero and wait for
 * a human to approve it would be theatre. Anything with a price becomes
 * PENDING_PAYMENT and moves to the receipt step.
 */
export async function selectPlan(input: z.infer<typeof selectPlanSchema>): Promise<PlanActionResult> {
  try {
    const user = await requireTrainer();
    // Read approval from the row, not the session claim: an admin approving a
    // trainer who is already signed in does not refresh their JWT.
    if (!(await isApprovedTrainer(user.trainerId))) {
      return { ok: false, error: 'حسابك لم يُعتمد بعد' };
    }

    const data = selectPlanSchema.parse(input);

    const plan = await prisma.plan.findFirst({
      where: { id: data.planId, isActive: true, isPublic: true },
    });
    if (!plan) return { ok: false, error: 'الخطة غير متاحة' };

    // Refuse to start a second subscription while one is already live.
    const existingActive = await prisma.subscription.findFirst({
      where: { trainerId: user.trainerId, status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { id: true },
    });
    if (existingActive) return { ok: false, error: 'لديك اشتراك نشط بالفعل', next: '/dash/billing' };

    const basePrice = planPrice(plan.prices, data.currency);

    // Coupon, if any. An invalid code fails the whole action rather than
    // silently charging full price.
    let coupon = null;
    if (data.couponCode) {
      coupon = await prisma.coupon.findUnique({ where: { code: data.couponCode.toUpperCase() } });
      const rejection = checkCoupon(coupon, plan.id);
      if (rejection) return { ok: false, error: COUPON_MESSAGES[rejection].ar };
    }

    const amount = priceAfterCoupon(basePrice, coupon);
    const trial = amount === 0 ? trialCycle(plan.trialDays || 14) : null;

    const subscription = await prisma.$transaction(async (tx) => {
      // Supersede any stale unpaid attempt so the trainer does not accumulate
      // dangling PENDING_PAYMENT rows by changing their mind.
      await tx.subscription.updateMany({
        where: { trainerId: user.trainerId, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });

      const created = await tx.subscription.create({
        data: {
          trainerId: user.trainerId,
          planId: plan.id,
          status: trial ? 'TRIALING' : 'PENDING_PAYMENT',
          currency: data.currency,
          amount,
          couponId: coupon?.id ?? null,
          startsAt: trial?.startsAt ?? null,
          endsAt: trial?.endsAt ?? null,
          trialEndsAt: trial?.endsAt ?? null,
        },
      });

      if (coupon) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      return created;
    });

    if (trial) {
      await resetCounters(subscription.id, trial.startsAt, trial.endsAt);
    }

    await audit({
      actorId: user.id,
      action: trial ? 'subscription.trial_start' : 'subscription.select_plan',
      entity: 'Subscription',
      entityId: subscription.id,
      after: { planKey: plan.key, currency: data.currency, amount },
    });

    return {
      ok: true,
      subscriptionId: subscription.id,
      next: trial ? '/dash' : `/onboarding/plan/${subscription.id}/pay`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: 'بيانات غير صالحة' };
    return toActionError(error) as PlanActionResult;
  }
}

/** Live coupon check for the plan picker, so the price updates as they type. */
export async function validateCoupon(input: {
  code: string;
  planId: string;
  currency: string;
}): Promise<{ ok: boolean; error?: string; amount?: number; discount?: number }> {
  try {
    await requireTrainer();

    const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) return { ok: false, error: 'الخطة غير متاحة' };

    const coupon = await prisma.coupon.findUnique({
      where: { code: input.code.trim().toUpperCase() },
    });
    const rejection = checkCoupon(coupon, plan.id);
    if (rejection) return { ok: false, error: COUPON_MESSAGES[rejection].ar };

    const basePrice = planPrice(plan.prices, input.currency);
    const amount = priceAfterCoupon(basePrice, coupon);
    return { ok: true, amount, discount: Math.round((basePrice - amount) * 100) / 100 };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Records a transfer receipt against a subscription.
 *
 * This creates the exact `Payment` row the admin activations centre already
 * reviews, so no new admin work is needed to complete the loop.
 */
export async function submitReceipt(formData: FormData): Promise<PlanActionResult> {
  try {
    const user = await requireTrainer();

    const subscriptionId = String(formData.get('subscriptionId') ?? '');
    const reference = String(formData.get('reference') ?? '').trim();
    const method = String(formData.get('method') ?? 'MANUAL_TRANSFER');
    const file = formData.get('receipt');

    // Scoped read: a trainer can only pay for their own subscription.
    const subscription = await prisma.subscription.findFirst({
      where: { id: subscriptionId, trainerId: user.trainerId },
      include: { plan: { select: { nameAr: true } }, payments: { where: { status: 'PENDING' }, select: { id: true } } },
    });
    if (!subscription) return { ok: false, error: 'الاشتراك غير موجود' };
    if (subscription.payments.length > 0) {
      return { ok: false, error: 'لديك إيصال قيد المراجعة بالفعل', next: `/onboarding/plan/${subscriptionId}/review` };
    }

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'ارفع صورة الإيصال' };
    }

    const stored = await uploadFile(file, `receipts/${user.trainerId}`, 'image');

    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount: subscription.amount,
        currency: subscription.currency,
        method: method as never,
        status: 'PENDING',
        receiptUrl: stored.url,
        reference: reference || null,
      },
    });

    // Tell the admins there is money waiting to be verified.
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    await Promise.all([
      audit({
        actorId: user.id,
        action: 'payment.submit_receipt',
        entity: 'Subscription',
        entityId: subscription.id,
        after: { reference, method },
      }),
      ...admins.map((admin) =>
        notify({
          userId: admin.id,
          type: 'SYSTEM',
          titleAr: 'إيصال دفع جديد للمراجعة',
          titleEn: 'New payment receipt to review',
          bodyAr: `اشتراك ${subscription.plan.nameAr}`,
          bodyEn: `Subscription payment awaiting approval`,
          link: '/admin/activations',
        }),
      ),
    ]);

    return { ok: true, next: `/onboarding/plan/${subscription.id}/review` };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return toActionError(error) as PlanActionResult;
  }
}

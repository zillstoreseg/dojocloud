'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, toActionError } from '@/lib/authz';
import { audit, notify } from '@/lib/audit';
import { decryptSecret } from '@/lib/crypto';
import { uploadFile, UploadError } from '@/lib/storage';
import { markPayoutPaid, rejectPayout, adjust, WalletError } from '@/lib/wallet';
import { formatMoney } from '@/lib/money';

export interface PayoutAdminResult {
  ok: boolean;
  error?: string;
  destination?: Record<string, string | null>;
}

async function loadPayout(id: string) {
  return prisma.payoutRequest.findUnique({
    where: { id },
    include: {
      wallet: {
        select: {
          currency: true,
          trainer: { select: { id: true, fullName: true, userId: true } },
        },
      },
    },
  });
}

/**
 * Reveals the coach's bank details for one request.
 *
 * Separate from loading the list on purpose: these are credentials, so they
 * are decrypted only when an admin explicitly asks for them, and the ask is
 * written to the audit log with the admin's name against it.
 */
export async function revealDestination(input: { id: string }): Promise<PayoutAdminResult> {
  try {
    const admin = await requireAdmin('payouts.write');
    const payout = await loadPayout(input.id);
    if (!payout) return { ok: false, error: 'الطلب غير موجود' };

    const destination = JSON.parse(decryptSecret(payout.destination)) as Record<
      string,
      string | null
    >;

    await audit({
      actorId: admin.id,
      action: 'payout.reveal_destination',
      entity: 'PayoutRequest',
      entityId: payout.id,
      after: { trainer: payout.wallet.trainer.fullName },
    });

    return { ok: true, destination };
  } catch (error) {
    return toActionError(error) as PayoutAdminResult;
  }
}

const resolveSchema = z.object({
  id: z.string().min(1),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

/** Confirms the transfer went out, with the proof attached. */
export async function payPayout(input: {
  id: string;
  note?: string;
  proof?: FormData;
}): Promise<PayoutAdminResult> {
  try {
    const admin = await requireAdmin('payouts.write');
    const data = resolveSchema.parse({ id: input.id, note: input.note });

    const payout = await loadPayout(data.id);
    if (!payout) return { ok: false, error: 'الطلب غير موجود' };

    let proofUrl: string | undefined;
    const file = input.proof?.get('proof');
    if (file instanceof File && file.size > 0) {
      const stored = await uploadFile(file, `payouts/${payout.wallet.trainer.id}`, 'image');
      proofUrl = stored.url;
    }

    await markPayoutPaid({ payoutId: payout.id, adminId: admin.id, proofUrl, note: data.note });

    await audit({
      actorId: admin.id,
      action: 'payout.paid',
      entity: 'PayoutRequest',
      entityId: payout.id,
      after: { amount: payout.amount.toString(), proofUrl: proofUrl ?? null },
    });

    await notify({
      userId: payout.wallet.trainer.userId,
      type: 'SYSTEM',
      titleAr: 'تم تحويل فلوسك 💸',
      titleEn: 'Your payout was sent 💸',
      bodyAr: `${formatMoney(Number(payout.amount), payout.currency, 'ar')} اتحوّلت لحسابك.`,
      bodyEn: `${formatMoney(Number(payout.amount), payout.currency, 'en')} is on its way.`,
      link: '/dash/wallet',
    });

    revalidatePath('/[locale]/admin/payouts', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof WalletError) return { ok: false, error: error.message };
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return toActionError(error) as PayoutAdminResult;
  }
}

/** Refuses the request and returns the reserved money to the coach. */
export async function declinePayout(input: {
  id: string;
  reason: string;
}): Promise<PayoutAdminResult> {
  try {
    const admin = await requireAdmin('payouts.write');
    if (input.reason.trim().length < 3) return { ok: false, error: 'اكتب سبب الرفض' };

    const payout = await loadPayout(input.id);
    if (!payout) return { ok: false, error: 'الطلب غير موجود' };

    await rejectPayout({ payoutId: payout.id, adminId: admin.id, reason: input.reason.trim() });

    await audit({
      actorId: admin.id,
      action: 'payout.reject',
      entity: 'PayoutRequest',
      entityId: payout.id,
      after: { reason: input.reason },
    });

    await notify({
      userId: payout.wallet.trainer.userId,
      type: 'SYSTEM',
      titleAr: 'اترفض طلب السحب',
      titleEn: 'Your payout request was declined',
      bodyAr: `${input.reason} — المبلغ رجع لرصيدك.`,
      bodyEn: `${input.reason} — the amount is back in your balance.`,
      link: '/dash/wallet',
    });

    revalidatePath('/[locale]/admin/payouts', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof WalletError) return { ok: false, error: error.message };
    return toActionError(error) as PayoutAdminResult;
  }
}

const adjustSchema = z.object({
  trainerId: z.string().min(1),
  amount: z.number().refine((n) => n !== 0, 'المبلغ لازم يكون موجب أو سالب'),
  reason: z.string().trim().min(3, 'اكتب سبب التسوية').max(500),
});

/** Manual correction. Bypasses every rule, so the reason is not optional. */
export async function adjustWallet(
  input: z.input<typeof adjustSchema>,
): Promise<PayoutAdminResult> {
  try {
    const admin = await requireAdmin('payouts.write');
    const data = adjustSchema.parse(input);

    await adjust({
      trainerId: data.trainerId,
      amount: data.amount,
      reason: data.reason,
      adminId: admin.id,
    });

    await audit({
      actorId: admin.id,
      action: 'wallet.adjust',
      entity: 'Wallet',
      entityId: data.trainerId,
      after: { amount: data.amount, reason: data.reason },
    });

    revalidatePath('/[locale]/admin/payouts', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof WalletError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as PayoutAdminResult;
  }
}

/** Stops a wallet from paying out while a dispute is open. */
export async function setWalletFrozen(input: {
  trainerId: string;
  frozen: boolean;
  note?: string;
}): Promise<PayoutAdminResult> {
  try {
    const admin = await requireAdmin('payouts.write');

    await prisma.wallet.update({
      where: { trainerId: input.trainerId },
      data: { isFrozen: input.frozen, freezeNote: input.frozen ? (input.note ?? null) : null },
    });

    await audit({
      actorId: admin.id,
      action: input.frozen ? 'wallet.freeze' : 'wallet.unfreeze',
      entity: 'Wallet',
      entityId: input.trainerId,
      after: { note: input.note ?? null },
    });

    revalidatePath('/[locale]/admin/payouts', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PayoutAdminResult;
  }
}

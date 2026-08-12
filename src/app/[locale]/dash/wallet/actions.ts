'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { PayoutMethod } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTrainer, toActionError } from '@/lib/authz';
import { encryptSecret } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { requestPayout, payoutLimits, WalletError } from '@/lib/wallet';

export interface WalletActionResult {
  ok: boolean;
  error?: string;
  payoutId?: string;
}

const payoutSchema = z.object({
  amount: z.number().positive('اكتب مبلغ صحيح'),
  method: z.enum(['BANK', 'INSTAPAY', 'VODAFONE_CASH', 'WISE', 'OTHER']),
  accountName: z.string().trim().min(2, 'اكتب اسم صاحب الحساب').max(120),
  accountNumber: z.string().trim().min(4, 'اكتب رقم الحساب').max(60),
  bankName: z.string().trim().max(120).optional().or(z.literal('')),
  note: z.string().trim().max(300).optional().or(z.literal('')),
});

/**
 * A coach asking for their money.
 *
 * The destination details are encrypted before they touch the database: they
 * are bank credentials, they are only ever needed by one admin at one moment,
 * and they should not be readable by anything that can run a SELECT.
 */
export async function createPayoutRequest(
  input: z.input<typeof payoutSchema>,
): Promise<WalletActionResult> {
  try {
    const user = await requireTrainer();
    const data = payoutSchema.parse(input);

    const limits = await payoutLimits();
    if (!limits.methods.includes(data.method as PayoutMethod)) {
      return { ok: false, error: 'وسيلة التحويل دي مش متاحة' };
    }

    const destination = encryptSecret(
      JSON.stringify({
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankName: data.bankName || null,
        note: data.note || null,
      }),
    );

    const request = await requestPayout({
      trainerId: user.trainerId,
      amount: data.amount,
      method: data.method as PayoutMethod,
      destination,
    });

    await audit({
      actorId: user.id,
      action: 'payout.request',
      entity: 'PayoutRequest',
      entityId: request.id,
      after: { amount: data.amount, method: data.method },
    });

    revalidatePath('/[locale]/dash/wallet', 'page');
    return { ok: true, payoutId: request.id };
  } catch (error) {
    if (error instanceof WalletError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as WalletActionResult;
  }
}

/** Lets a coach withdraw a request the admin has not started on yet. */
export async function cancelPayoutRequest(input: { id: string }): Promise<WalletActionResult> {
  try {
    const user = await requireTrainer();

    const request = await prisma.payoutRequest.findFirst({
      where: { id: input.id, status: 'PENDING', wallet: { trainerId: user.trainerId } },
      select: { id: true },
    });
    if (!request) return { ok: false, error: 'الطلب مش موجود أو بدأت مراجعته' };

    // Cancelling is a rejection the coach asked for, so it goes through the
    // same path and gives the reserved money back the same way.
    const { rejectPayout } = await import('@/lib/wallet');
    await rejectPayout({ payoutId: request.id, adminId: user.id, reason: 'ألغاه المدرب' });

    revalidatePath('/[locale]/dash/wallet', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof WalletError) return { ok: false, error: error.message };
    return toActionError(error) as WalletActionResult;
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { LeadStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTrainer, assertOwns, toActionError } from '@/lib/authz';
import { assertQuota, QUOTA_KEYS, QuotaExceededError } from '@/lib/quota';

export interface LeadActionResult {
  ok: boolean;
  error?: string;
  upgrade?: boolean;
  traineeId?: string;
}

function refresh() {
  revalidatePath('/[locale]/dash/leads', 'page');
}

export async function setLeadStatus(input: {
  id: string;
  status: LeadStatus;
}): Promise<LeadActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwns('lead', user.trainerId, input.id);

    await prisma.lead.update({
      where: { id: input.id },
      data: {
        status: input.status,
        contactedAt: input.status === 'CONTACTED' ? new Date() : undefined,
      },
    });

    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as LeadActionResult;
  }
}

const noteSchema = z.object({ id: z.string().min(1), note: z.string().trim().max(2000) });

export async function setLeadNote(input: z.input<typeof noteSchema>): Promise<LeadActionResult> {
  try {
    const user = await requireTrainer();
    const data = noteSchema.parse(input);
    await assertOwns('lead', user.trainerId, data.id);

    await prisma.lead.update({
      where: { id: data.id },
      data: { note: data.note || null },
    });

    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as LeadActionResult;
  }
}

/**
 * Turns a lead into a trainee — the moment the whole landing page exists to
 * produce, so the link between the two rows is kept rather than the lead being
 * consumed and discarded.
 */
export async function convertLead(input: { id: string }): Promise<LeadActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwns('lead', user.trainerId, input.id);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: input.id } });
    if (lead.convertedTraineeId) {
      return { ok: true, traineeId: lead.convertedTraineeId };
    }

    await assertQuota(user.trainerId, QUOTA_KEYS.TRAINEES);

    const traineeId = await prisma.$transaction(async (tx) => {
      const trainee = await tx.trainee.create({
        data: {
          trainerId: user.trainerId,
          fullName: lead.name,
          phone: lead.phone,
          email: lead.email,
          notes: [lead.goal, lead.message].filter(Boolean).join('\n') || null,
        },
        select: { id: true },
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: { status: 'CONVERTED', convertedTraineeId: trainee.id },
      });

      return trainee.id;
    });

    refresh();
    revalidatePath('/[locale]/dash/trainees', 'page');
    return { ok: true, traineeId };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        upgrade: true,
        error: `وصلت للحد الأقصى للمتدربين في خطتك (${error.limit}).`,
      };
    }
    return toActionError(error) as LeadActionResult;
  }
}

export async function deleteLead(input: { id: string }): Promise<LeadActionResult> {
  try {
    const user = await requireTrainer();
    const result = await prisma.lead.deleteMany({
      where: { id: input.id, trainerId: user.trainerId },
    });
    if (result.count === 0) return { ok: false, error: 'العميل غير موجود' };

    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as LeadActionResult;
  }
}

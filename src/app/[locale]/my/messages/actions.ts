'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { toActionError } from '@/lib/authz';
import { requireTraineeContext } from '@/lib/trainee/portal';
import {
  openConversation,
  sendMessage,
  markConversationRead,
  MessagingError,
} from '@/lib/messaging';

export interface MessageResult {
  ok: boolean;
  error?: string;
}

function messageError(error: MessagingError): string {
  switch (error.code) {
    case 'RATE_LIMITED':
      return 'بعتّ رسائل كتير في وقت قصير. استنى شوية.';
    case 'EMPTY':
      return 'اكتب رسالة الأول';
    case 'TOO_LONG':
      return 'الرسالة طويلة أوي';
    default:
      return 'المحادثة دي مش موجودة';
  }
}

/**
 * A trainee writes to their coach.
 *
 * Takes no id at all. A trainee has exactly one coach, and it is on their own
 * row — so there is nothing here for a hostile caller to point somewhere else.
 */
export async function sendTraineeMessage(input: { body: string }): Promise<MessageResult> {
  try {
    const ctx = await requireTraineeContext();

    const conversation = await openConversation({
      trainerId: ctx.trainerId,
      traineeId: ctx.traineeId,
    });

    await sendMessage({
      conversationId: conversation.id,
      senderId: ctx.userId,
      senderSide: 'trainee',
      body: input.body,
    });

    revalidatePath('/[locale]/my/messages', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof MessagingError) return { ok: false, error: messageError(error) };
    return toActionError(error) as MessageResult;
  }
}

/** Marks the trainee's own thread read. The argument is ignored on purpose. */
export async function markTraineeThreadRead(): Promise<MessageResult> {
  try {
    const ctx = await requireTraineeContext();

    const conversation = await prisma.conversation.findFirst({
      where: { trainerId: ctx.trainerId, traineeId: ctx.traineeId },
      select: { id: true },
    });
    if (!conversation) return { ok: true };

    await markConversationRead({ conversationId: conversation.id, readerId: ctx.userId });
    revalidatePath('/[locale]/my/messages', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as MessageResult;
  }
}

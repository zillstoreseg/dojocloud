'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTrainer, toActionError } from '@/lib/authz';
import {
  openConversation,
  sendMessage,
  markConversationRead,
  MessagingError,
} from '@/lib/messaging';

export interface MessageResult {
  ok: boolean;
  error?: string;
  conversationId?: string;
}

function messageError(error: unknown): string {
  if (error instanceof MessagingError) {
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
  return 'حصل خطأ، جرّب تاني';
}

/** Coach sends a message to one of their trainees. */
export async function sendCoachMessage(input: {
  traineeId: string;
  body: string;
}): Promise<MessageResult> {
  try {
    const user = await requireTrainer();

    // The conversation is resolved from the coach's own id and the trainee id,
    // and `openConversation` verifies the pair — so a forged trainee id yields
    // "not found" rather than a thread with somebody else's client.
    const conversation = await openConversation({
      trainerId: user.trainerId,
      traineeId: input.traineeId,
    });

    await sendMessage({
      conversationId: conversation.id,
      senderId: user.id,
      senderSide: 'coach',
      body: input.body,
    });

    revalidatePath('/[locale]/dash/messages', 'page');
    return { ok: true, conversationId: conversation.id };
  } catch (error) {
    if (error instanceof MessagingError) return { ok: false, error: messageError(error) };
    return toActionError(error) as MessageResult;
  }
}

/** Marks a thread read. Scoped to threads this coach owns. */
export async function markCoachThreadRead(conversationId: string): Promise<MessageResult> {
  try {
    const user = await requireTrainer();

    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, trainerId: user.trainerId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: 'المحادثة دي مش موجودة' };

    await markConversationRead({ conversationId: owned.id, readerId: user.id });
    revalidatePath('/[locale]/dash/messages', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as MessageResult;
  }
}

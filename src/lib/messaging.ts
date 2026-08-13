import { prisma } from './prisma';
import { notify } from './audit';
import { rateLimit } from './rate-limit';

/**
 * Coach ↔ trainee messaging.
 *
 * One conversation per pair, enforced by a unique constraint rather than by
 * checking first — two people opening the thread at the same moment must not
 * create two of them, and a race that ends in a duplicate would silently split
 * their history in half.
 *
 * Both sides reach this module through their own entry point, and neither ever
 * passes a `conversationId` that has not been checked against who they are.
 * A conversation id is the whole key to somebody's private messages with their
 * coach, so it is never trusted on its own.
 */

export class MessagingError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'RATE_LIMITED' | 'EMPTY' | 'TOO_LONG',
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Returns the conversation for a coach/trainee pair, creating it on first use.
 *
 * The upsert leans on the `@@unique([trainerId, traineeId])` constraint, so
 * concurrent first messages converge on one row instead of racing.
 */
export async function openConversation(input: {
  trainerId: string;
  traineeId: string;
}): Promise<{ id: string }> {
  // The pair is verified before anything is created: a trainee id that does
  // not belong to this coach must not produce a thread, whoever asked.
  const trainee = await prisma.trainee.findFirst({
    where: { id: input.traineeId, trainerId: input.trainerId },
    select: { id: true },
  });
  if (!trainee) throw new MessagingError('No such trainee for this coach', 'NOT_FOUND');

  return prisma.conversation.upsert({
    where: {
      trainerId_traineeId: { trainerId: input.trainerId, traineeId: input.traineeId },
    },
    create: { trainerId: input.trainerId, traineeId: input.traineeId },
    update: {},
    select: { id: true },
  });
}

export interface SendInput {
  conversationId: string;
  senderId: string;
  /** Who the sender is, so the notification goes to the other party. */
  senderSide: 'coach' | 'trainee';
  body: string;
}

/**
 * Appends a message and notifies the other side.
 *
 * The conversation is re-read and its participants checked against the sender
 * before the write, so this function is safe to call with an id that came from
 * a form. Notification goes to the *other* party only — telling someone their
 * own message arrived is noise, and it is the kind of noise that teaches
 * people to ignore the bell.
 */
export async function sendMessage(input: SendInput): Promise<{ id: string }> {
  const body = input.body.trim();
  if (!body) throw new MessagingError('Empty message', 'EMPTY');
  if (body.length > MAX_MESSAGE_LENGTH) throw new MessagingError('Message too long', 'TOO_LONG');

  const limit = await rateLimit('message', input.senderId);
  if (!limit.allowed) throw new MessagingError('Too many messages', 'RATE_LIMITED');

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      trainer: { select: { id: true, userId: true, fullName: true } },
      trainee: { select: { id: true, userId: true, fullName: true } },
    },
  });
  if (!conversation) throw new MessagingError('No such conversation', 'NOT_FOUND');

  const senderIsParticipant =
    input.senderSide === 'coach'
      ? conversation.trainer.userId === input.senderId
      : conversation.trainee.userId === input.senderId;
  if (!senderIsParticipant) throw new MessagingError('Not your conversation', 'NOT_FOUND');

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: conversation.id, senderId: input.senderId, body },
      select: { id: true },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  const recipientUserId =
    input.senderSide === 'coach' ? conversation.trainee.userId : conversation.trainer.userId;
  const senderName =
    input.senderSide === 'coach' ? conversation.trainer.fullName : conversation.trainee.fullName;

  // A trainee without a login has nowhere to receive this.
  if (recipientUserId) {
    await notify({
      userId: recipientUserId,
      type: 'NEW_MESSAGE',
      titleAr: `رسالة جديدة من ${senderName}`,
      titleEn: `New message from ${senderName}`,
      bodyAr: body.slice(0, 120),
      bodyEn: body.slice(0, 120),
      link: input.senderSide === 'coach' ? '/my/messages' : '/dash/messages',
      // In-app only. A message is a conversation, not an announcement — one
      // email per line of chat is the fastest way to get muted.
      email: false,
    });
  }

  return message;
}

/** Marks everything the other party sent as read. */
export async function markConversationRead(input: {
  conversationId: string;
  readerId: string;
}): Promise<void> {
  await prisma.message.updateMany({
    where: {
      conversationId: input.conversationId,
      senderId: { not: input.readerId },
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

/** Unread count across every conversation, for the nav badge. */
export async function unreadMessageCount(input: {
  userId: string;
  trainerId?: string;
  traineeId?: string;
}): Promise<number> {
  const where = input.trainerId
    ? { conversation: { trainerId: input.trainerId } }
    : { conversation: { traineeId: input.traineeId ?? '' } };

  return prisma.message.count({
    where: { ...where, senderId: { not: input.userId }, readAt: null },
  });
}

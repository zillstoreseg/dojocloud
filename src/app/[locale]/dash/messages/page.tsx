import { setRequestLocale } from 'next-intl/server';
import { MessageSquare } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { TrainerPage } from '@/components/trainer/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/money';
import { MessagingPanel, type ThreadSummary, type ThreadMessage } from '@/components/messaging/panel';

export default async function CoachMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale } = await params;
  const { t: selectedTraineeId } = await searchParams;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  // Every active trainee is a potential thread, whether or not one exists yet —
  // a coach should be able to start the conversation, not only continue it.
  const trainees = await prisma.trainee.findMany({
    where: { trainerId: user.trainerId, status: { in: ['ACTIVE', 'PAUSED'] } },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      conversations: {
        select: {
          id: true,
          lastMessageAt: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true, senderId: true, readAt: true },
          },
          _count: {
            select: { messages: { where: { senderId: { not: user.id }, readAt: null } } },
          },
        },
      },
    },
    take: 200,
  });

  if (trainees.length === 0) {
    return (
      <TrainerPage title={isAr ? 'الرسائل' : 'Messages'}>
        <EmptyState
          icon={<MessageSquare />}
          title={isAr ? 'مفيش متدربين لسه' : 'No trainees yet'}
          description={
            isAr
              ? 'أول ما يشترك معاك متدرب هتقدر تكلّمه من هنا.'
              : 'Once a trainee subscribes you can talk to them here.'
          }
        />
      </TrainerPage>
    );
  }

  const threads: ThreadSummary[] = trainees
    .map((trainee) => {
      const conversation = trainee.conversations[0];
      const last = conversation?.messages[0];
      return {
        // The coach addresses a trainee, so the trainee id is the stable key;
        // the conversation may not exist yet.
        key: trainee.id,
        name: trainee.fullName,
        preview: last?.body.slice(0, 80) ?? null,
        lastAt: conversation ? formatDateTime(conversation.lastMessageAt, locale) : null,
        sortKey: conversation?.lastMessageAt.getTime() ?? 0,
        unread: conversation?._count.messages ?? 0,
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey || a.name.localeCompare(b.name));

  const active = selectedTraineeId ?? threads[0]?.key ?? null;

  let messages: ThreadMessage[] = [];
  if (active) {
    const conversation = await prisma.conversation.findFirst({
      where: { trainerId: user.trainerId, traineeId: active },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          select: { id: true, body: true, senderId: true, createdAt: true },
        },
      },
    });

    messages = (conversation?.messages ?? []).map((message) => ({
      id: message.id,
      body: message.body,
      mine: message.senderId === user.id,
      at: formatDateTime(message.createdAt, locale),
    }));
  }

  return (
    <TrainerPage
      title={isAr ? 'الرسائل' : 'Messages'}
      description={
        isAr
          ? 'محادثة مباشرة مع كل متدرب — كل واحد بيشوف محادثته هو بس.'
          : 'A direct thread with each trainee — each sees only their own.'
      }
    >
      <MessagingPanel
        locale={locale}
        threads={threads}
        activeKey={active}
        messages={messages}
        side="coach"
        emptyLabel={isAr ? 'اختار متدرب من القايمة' : 'Pick a trainee from the list'}
      />
    </TrainerPage>
  );
}

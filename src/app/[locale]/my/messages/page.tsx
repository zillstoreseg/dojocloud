import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { requireTraineePage } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { formatDateTime } from '@/lib/money';
import { MessagingPanel, type ThreadMessage } from '@/components/messaging/panel';

export default async function TraineeMessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const conversation = await prisma.conversation.findFirst({
    where: { trainerId: ctx.trainerId, traineeId: ctx.traineeId },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: { id: true, body: true, senderId: true, createdAt: true },
      },
    },
  });

  const messages: ThreadMessage[] = (conversation?.messages ?? []).map((message) => ({
    id: message.id,
    body: message.body,
    mine: message.senderId === ctx.userId,
    at: formatDateTime(message.createdAt, locale),
  }));

  return (
    <TraineePage
      title={isAr ? `رسائلك مع ${ctx.coach.fullName}` : `Messages with ${ctx.coach.fullName}`}
      description={
        isAr
          ? 'اسأل مدربك في أي حاجة — التمرين، الأكل، أو لو حاسس بوجع.'
          : 'Ask your coach anything — a lift, a meal, or a niggle.'
      }
    >
      <MessagingPanel
        locale={locale}
        threads={[]}
        // The trainee has one coach, so the thread key is fixed and the list
        // collapses away.
        activeKey={ctx.traineeId}
        messages={messages}
        side="trainee"
        emptyLabel=""
      />
    </TraineePage>
  );
}

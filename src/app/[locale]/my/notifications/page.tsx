import { setRequestLocale } from 'next-intl/server';
import { Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireTraineePage } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/money';
import { MarkReadButton } from './mark-read';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const notifications = await prisma.notification.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <TraineePage
      title={isAr ? 'الإشعارات' : 'Notifications'}
      actions={unread > 0 ? <MarkReadButton locale={locale} /> : undefined}
    >
      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title={isAr ? 'مفيش إشعارات' : 'Nothing yet'}
          description={
            isAr
              ? 'هنبلّغك أول ما مدربك يحدّث برنامجك أو يقرب ميعاد تجديدك.'
              : 'We’ll tell you when your coach updates your program or your renewal is near.'
          }
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((item) => (
            <Card key={item.id} className={item.readAt ? '' : 'border-primary/40 bg-primary/[0.03]'}>
              <CardContent className="space-y-1 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{isAr ? item.titleAr : item.titleEn}</p>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {formatDateTime(item.createdAt, locale)}
                  </span>
                </div>
                {(isAr ? item.bodyAr : item.bodyEn) ? (
                  <p className="text-sm text-muted-foreground">
                    {isAr ? item.bodyAr : item.bodyEn}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </TraineePage>
  );
}

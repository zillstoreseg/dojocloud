import { setRequestLocale } from 'next-intl/server';
import { CreditCard } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireTraineePage } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getSettings } from '@/lib/settings';
import { formatMoney, formatDate, decimalToNumber } from '@/lib/money';
import { daysRemaining } from '@/lib/billing';
import { RenewalPanel, type PendingSub } from './renewal-panel';

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  PENDING: { ar: 'في انتظار المراجعة', en: 'Awaiting review' },
  APPROVED: { ar: 'مفعّل', en: 'Active' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected' },
  REFUNDED: { ar: 'مسترجع', en: 'Refunded' },
};

export default async function MySubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const [subs, payment, packages] = await Promise.all([
    prisma.traineeSubscription.findMany({
      where: { traineeId: ctx.traineeId },
      orderBy: { createdAt: 'desc' },
      include: { package: { select: { name: true, durationDays: true } } },
    }),
    getSettings('payment'),
    prisma.trainerPackage.findMany({
      where: { trainerId: ctx.trainerId, isActive: true, isPublic: true },
      orderBy: { price: 'asc' },
      select: { id: true, name: true, price: true, currency: true, durationDays: true },
    }),
  ]);

  const active = subs.find((s) => s.status === 'APPROVED' && (!s.endsAt || s.endsAt > new Date()));
  const pending = subs.find((s) => s.status === 'PENDING');

  const pendingRow: PendingSub | null = pending
    ? {
        id: pending.id,
        packageName: pending.package.name,
        amount: decimalToNumber(pending.amount),
        currency: pending.currency,
        hasReceipt: Boolean(pending.receiptUrl),
      }
    : null;

  return (
    <TraineePage
      title={isAr ? 'اشتراكي' : 'My subscription'}
      description={
        isAr
          ? `اشتراكك مع ${ctx.coach.fullName}.`
          : `Your subscription with ${ctx.coach.fullName}.`
      }
    >
      {active ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 p-6">
            <div>
              <p className="text-sm text-muted-foreground">{isAr ? 'باقتك' : 'Your package'}</p>
              <p className="font-display text-2xl font-semibold">{active.package.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isAr ? 'تنتهي في' : 'Ends'}</p>
              <p className="font-display text-xl font-semibold tabular-nums">
                {formatDate(active.endsAt, locale)}
              </p>
            </div>
            {active.endsAt ? (
              <Badge variant={daysRemaining(active.endsAt) <= 7 ? 'warning' : 'success'}>
                {isAr
                  ? `فاضل ${daysRemaining(active.endsAt)} يوم`
                  : `${daysRemaining(active.endsAt)} days left`}
              </Badge>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<CreditCard />}
          title={isAr ? 'مفيش اشتراك نشط' : 'No active subscription'}
          description={
            isAr
              ? 'جدّد مع مدربك عشان تكمّل برنامجك.'
              : 'Renew with your coach to keep your program running.'
          }
        />
      )}

      <RenewalPanel
        locale={locale}
        pending={pendingRow}
        packages={packages.map((p) => ({
          id: p.id,
          name: p.name,
          price: formatMoney(decimalToNumber(p.price), p.currency, locale),
          durationDays: p.durationDays,
        }))}
        instructions={{
          text: (isAr ? payment['payment.instructions_ar'] : payment['payment.instructions_en']) ?? '',
          bankName: payment['payment.bank_name'] ?? '',
          bankAccount: payment['payment.bank_account'] ?? '',
          instapay: payment['payment.instapay'] ?? '',
          vodafoneCash: payment['payment.vodafone_cash'] ?? '',
        }}
        coachName={ctx.coach.fullName}
      />

      {subs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display font-semibold">{isAr ? 'سجل اشتراكاتك' : 'History'}</h2>
          <div className="space-y-2">
            {subs.map((sub) => (
              <Card key={sub.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{sub.package.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(sub.createdAt, locale)}
                      {sub.startsAt && sub.endsAt
                        ? ` · ${formatDate(sub.startsAt, locale)} → ${formatDate(sub.endsAt, locale)}`
                        : ''}
                    </p>
                    {sub.adminNote ? (
                      <p className="mt-1 text-xs text-muted-foreground">{sub.adminNote}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display font-semibold tabular-nums">
                      {formatMoney(decimalToNumber(sub.amount), sub.currency, locale)}
                    </span>
                    <Badge variant={statusVariant(sub.status)}>
                      {STATUS_LABELS[sub.status]?.[isAr ? 'ar' : 'en'] ?? sub.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </TraineePage>
  );
}

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Clock, Receipt } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { formatMoney, decimalToNumber } from '@/lib/money';
import { AuthShell } from '@/components/auth/auth-shell';
import { StepperHeader } from '@/components/ui/stepper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SignOutButton } from '../../../pending/sign-out-button';

export default async function PaymentReviewPage({
  params,
}: {
  params: Promise<{ locale: string; subscriptionId: string }>;
}) {
  const { locale, subscriptionId } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale, ['payment-in-review']);
  const isAr = locale === 'ar';

  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, trainerId: user.trainerId },
    include: {
      plan: { select: { nameAr: true, nameEn: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!subscription) notFound();

  const brand = await getBrand();
  const pending = subscription.payments.find((payment) => payment.status === 'PENDING');

  return (
    <AuthShell
      brandName={brand.name}
      title={isAr ? 'إيصالك تحت المراجعة' : 'Your receipt is under review'}
      description={
        isAr
          ? 'الإدارة بتراجع التحويل. أول ما يتأكد، اشتراكك يتفعّل وتفتح لوحة التحكم.'
          : 'An admin is verifying the transfer. As soon as it clears, your subscription activates and the dashboard opens.'
      }
      width="lg"
      footer={<SignOutButton locale={locale} label={isAr ? 'تسجيل الخروج' : 'Sign out'} />}
    >
      <StepperHeader
        steps={[
          { key: 'plan', label: isAr ? 'الخطة' : 'Plan' },
          { key: 'pay', label: isAr ? 'الدفع' : 'Payment' },
          { key: 'review', label: isAr ? 'التفعيل' : 'Activation' },
        ]}
        current={2}
      />

      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/30" aria-hidden />
            <Clock className="relative size-5" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">{isAr ? 'عادةً خلال ساعات قليلة' : 'Usually within a few hours'}</p>
            <p className="text-sm text-muted-foreground">
              {isAr ? subscription.plan.nameAr : subscription.plan.nameEn} ·{' '}
              {formatMoney(decimalToNumber(subscription.amount), subscription.currency, locale)}
            </p>
            {pending?.reference ? (
              <p className="text-sm text-muted-foreground" dir="ltr">
                #{pending.reference}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="font-medium">{isAr ? 'إيصالاتك' : 'Your receipts'}</p>
          <ul className="space-y-2">
            {subscription.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center gap-3 rounded-md border border-border/60 p-3"
              >
                <Receipt className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm tabular-nums">
                    {formatMoney(decimalToNumber(payment.amount), payment.currency, locale)}
                  </p>
                  {payment.adminNote ? (
                    <p className="truncate text-xs text-destructive">{payment.adminNote}</p>
                  ) : null}
                </div>
                <Badge
                  variant={
                    payment.status === 'APPROVED'
                      ? 'success'
                      : payment.status === 'REJECTED'
                        ? 'destructive'
                        : 'warning'
                  }
                >
                  {payment.status === 'APPROVED'
                    ? isAr
                      ? 'مقبول'
                      : 'Approved'
                    : payment.status === 'REJECTED'
                      ? isAr
                        ? 'مرفوض'
                        : 'Rejected'
                      : isAr
                        ? 'قيد المراجعة'
                        : 'Under review'}
                </Badge>
              </li>
            ))}
          </ul>

          {/* A rejected receipt has to be replaceable without starting over. */}
          {!pending ? (
            <Button variant="outline" asChild className="w-full">
              <Link href={`/onboarding/plan/${subscription.id}/pay`}>
                {isAr ? 'ارفع إيصالًا جديدًا' : 'Upload a new receipt'}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </AuthShell>
  );
}

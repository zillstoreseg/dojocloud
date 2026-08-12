import { setRequestLocale } from 'next-intl/server';
import { CheckCircle2, Clock, Lock, Receipt } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { resolveFlags } from '@/lib/flags';
import { getAllQuotas } from '@/lib/quota';
import { daysRemaining } from '@/lib/billing';
import { formatMoney, decimalToNumber, formatNumber, paymentMethodLabel, formatDate } from '@/lib/money';
import { TrainerPage, TrainerSection } from '@/components/trainer/page-shell';
import { QuotaGrid } from '@/components/trainer/quota-grid';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Feature rows shown as "what your plan includes", driven by the flag layer. */
const PLAN_FEATURES: { flag: string; ar: string; en: string }[] = [
  { flag: 'builder.enabled', ar: 'باني الصفحات', en: 'Page builder' },
  { flag: 'builder.remove_branding', ar: 'إخفاء علامة المنصة', en: 'Remove platform branding' },
  { flag: 'builder.custom_domain', ar: 'نطاق مخصص', en: 'Custom domain' },
  { flag: 'leads.crm', ar: 'إدارة العملاء المحتملين', en: 'Leads CRM' },
  { flag: 'ai.workout_generation', ar: 'توليد برامج بالذكاء الاصطناعي', en: 'AI workout generation' },
  { flag: 'ai.nutrition_generation', ar: 'توليد أنظمة تغذية', en: 'AI nutrition generation' },
  { flag: 'directory.featured', ar: 'ظهور مميز في الدليل', en: 'Featured in the directory' },
  { flag: 'data.export', ar: 'تصدير البيانات', en: 'Data export' },
];

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const [subscription, payments, quotas, flags] = await Promise.all([
    prisma.subscription.findFirst({
      where: { trainerId: user.trainerId, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { nameAr: true, nameEn: true, taglineAr: true, taglineEn: true, commissionPercent: true } },
        coupon: { select: { code: true } },
      },
    }),
    // History across every subscription, so a renewal does not hide the past.
    prisma.payment.findMany({
      where: { subscription: { trainerId: user.trainerId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    getAllQuotas(user.trainerId),
    resolveFlags(user.id),
  ]);

  const remaining = daysRemaining(subscription?.endsAt);
  const pendingPayment = payments.find((payment) => payment.status === 'PENDING');
  const commission = decimalToNumber(subscription?.plan.commissionPercent ?? 0);

  return (
    <TrainerPage
      title={isAr ? 'الاشتراك والفوترة' : 'Plan & billing'}
      description={
        isAr
          ? 'خطتك الحالية، حدودها، وسجل مدفوعاتك.'
          : 'Your current plan, its limits, and your payment history.'
      }
      actions={
        <Button asChild>
          <Link href="/onboarding/plan">{isAr ? 'تغيير الخطة' : 'Change plan'}</Link>
        </Button>
      }
    >
      {pendingPayment ? (
        <Alert variant="warning">
          <Clock />
          <div className="flex-1">
            <AlertTitle>{isAr ? 'لديك إيصال قيد المراجعة' : 'A receipt is under review'}</AlertTitle>
            <AlertDescription>
              {formatMoney(decimalToNumber(pendingPayment.amount), pendingPayment.currency, locale)}
              {' · '}
              {isAr
                ? 'هيتفعّل أول ما الإدارة تتأكد من التحويل.'
                : 'It activates as soon as an admin verifies the transfer.'}
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {/* Current plan */}
      <Card>
        <CardContent className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'الخطة' : 'Plan'}</p>
            <p className="font-display text-lg font-semibold">
              {subscription ? (isAr ? subscription.plan.nameAr : subscription.plan.nameEn) : '—'}
            </p>
            {subscription?.status === 'TRIALING' ? (
              <Badge variant="muted" className="mt-1 text-[11px]">
                {isAr ? 'فترة تجربة' : 'Trial'}
              </Badge>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'ينتهي بعد' : 'Renews in'}</p>
            <p className="font-display text-lg font-semibold tabular-nums">
              {formatNumber(remaining, locale)} {isAr ? 'يوم' : 'days'}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'القيمة' : 'Amount'}</p>
            <p className="font-display text-lg font-semibold tabular-nums">
              {subscription
                ? formatMoney(decimalToNumber(subscription.amount), subscription.currency, locale)
                : '—'}
            </p>
            {subscription?.coupon ? (
              <p className="text-xs text-success" dir="ltr">
                {subscription.coupon.code}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {isAr ? 'عمولة المنصة على مدفوعات متدربيك' : 'Platform fee on trainee payments'}
            </p>
            <p className="font-display text-lg font-semibold tabular-nums">{commission}%</p>
          </div>
        </CardContent>
      </Card>

      <TrainerSection title={isAr ? 'حدود خطتك' : 'Your plan limits'}>
        <QuotaGrid quotas={quotas} locale={locale} />
      </TrainerSection>

      <TrainerSection
        title={isAr ? 'المتاح في خطتك' : 'What your plan includes'}
        description={
          isAr
            ? 'الميزات المقفولة متاحة في خطط أعلى.'
            : 'Locked features are available on higher plans.'
        }
      >
        <Card>
          <CardContent className="grid gap-2 p-5 sm:grid-cols-2">
            {PLAN_FEATURES.map((feature) => {
              const enabled = flags.get(feature.flag)?.enabled ?? false;
              return (
                <div
                  key={feature.flag}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  {enabled ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <Lock className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={enabled ? '' : 'text-muted-foreground'}>
                    {isAr ? feature.ar : feature.en}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </TrainerSection>

      <TrainerSection title={isAr ? 'سجل المدفوعات' : 'Payment history'}>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{isAr ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead>{isAr ? 'الوسيلة' : 'Method'}</TableHead>
                  <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead className="text-end">{isAr ? 'الإيصال' : 'Receipt'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableEmpty colSpan={5}>
                    {isAr ? 'لا توجد مدفوعات بعد' : 'No payments yet'}
                  </TableEmpty>
                ) : (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {formatDate(payment.createdAt, locale)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatMoney(decimalToNumber(payment.amount), payment.currency, locale)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {paymentMethodLabel(payment.method, locale)}
                      </TableCell>
                      <TableCell>
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
                        {payment.adminNote ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{payment.adminNote}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-end">
                        {payment.receiptUrl ? (
                          <a
                            href={payment.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Receipt className="size-3.5" />
                            {isAr ? 'عرض' : 'View'}
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TrainerSection>
    </TrainerPage>
  );
}

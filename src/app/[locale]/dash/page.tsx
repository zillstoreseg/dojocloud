import { setRequestLocale } from 'next-intl/server';
import { CalendarClock, CreditCard, Dumbbell, Globe, Sparkles, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { getAllQuotas } from '@/lib/quota';
import { daysRemaining } from '@/lib/billing';
import { formatMoney, decimalToNumber, formatNumber } from '@/lib/money';
import { TrainerPage, TrainerSection } from '@/components/trainer/page-shell';
import { QuotaGrid } from '@/components/trainer/quota-grid';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';

export default async function TrainerDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const [profile, subscription, quotas, traineeCount] = await Promise.all([
    prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { fullName: true, username: true },
    }),
    prisma.subscription.findFirst({
      where: { trainerId: user.trainerId, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { nameAr: true, nameEn: true } } },
    }),
    getAllQuotas(user.trainerId),
    prisma.trainee.count({ where: { trainerId: user.trainerId } }),
  ]);

  const remaining = daysRemaining(subscription?.endsAt);
  const trialing = subscription?.status === 'TRIALING';

  // The first three things worth doing, in the order they unblock each other.
  const nextSteps = [
    {
      icon: Users,
      href: '/dash/trainees',
      ar: 'أضف أول متدرب',
      en: 'Add your first trainee',
      descAr: 'ملفه وهدفه وقياساته في مكان واحد.',
      descEn: 'Their profile, goal and measurements in one place.',
      done: traineeCount > 0,
    },
    {
      icon: Globe,
      href: '/dash/page',
      ar: 'ابنِ صفحتك',
      en: 'Build your page',
      descAr: `شاركها على السوشيال والزوار يشتركون منها: coachmate.app/c/${profile?.username ?? ''}`,
      descEn: `Share it and let visitors subscribe: coachmate.app/c/${profile?.username ?? ''}`,
      done: false,
    },
    {
      icon: Dumbbell,
      href: '/dash/exercises',
      ar: 'ابنِ مكتبة تمارينك',
      en: 'Build your exercise library',
      descAr: 'ابدأ من المكتبة العامة وأضف تمارينك.',
      descEn: 'Start from the public library and add your own.',
      done: false,
    },
  ];

  return (
    <TrainerPage
      title={isAr ? `أهلًا ${profile?.fullName ?? ''}` : `Welcome, ${profile?.fullName ?? ''}`}
      description={
        isAr ? 'نظرة سريعة على اشتراكك وحدودك.' : 'A quick look at your subscription and limits.'
      }
    >
      {/* Renewal nudge — only when it is actually close. */}
      {subscription && remaining <= 7 ? (
        <Alert variant="warning">
          <CalendarClock />
          <div className="flex-1">
            <AlertTitle>
              {trialing
                ? isAr
                  ? 'تجربتك على وشك الانتهاء'
                  : 'Your trial is ending'
                : isAr
                  ? 'اشتراكك على وشك الانتهاء'
                  : 'Your subscription is ending'}
            </AlertTitle>
            <AlertDescription>
              {isAr
                ? `باقي ${formatNumber(remaining, locale)} يوم. جدّد قبل ما يقف الحساب.`
                : `${remaining} days left. Renew before access pauses.`}
            </AlertDescription>
          </div>
          <Button size="sm" asChild>
            <Link href="/dash/billing">{isAr ? 'جدّد الآن' : 'Renew now'}</Link>
          </Button>
        </Alert>
      ) : null}

      {/* Subscription summary */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <CreditCard className="size-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">{isAr ? 'خطتك الحالية' : 'Your plan'}</p>
              <p className="font-display text-lg font-semibold">
                {subscription
                  ? isAr
                    ? subscription.plan.nameAr
                    : subscription.plan.nameEn
                  : '—'}
                {trialing ? (
                  <Badge variant="muted" className="ms-2 align-middle text-[11px]">
                    <Sparkles className="size-3" />
                    {isAr ? 'تجربة' : 'Trial'}
                  </Badge>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-muted-foreground">{isAr ? 'ينتهي بعد' : 'Renews in'}</p>
              <p className="font-display text-lg font-semibold tabular-nums">
                {formatNumber(remaining, locale)} {isAr ? 'يوم' : 'days'}
              </p>
            </div>
            {subscription && decimalToNumber(subscription.amount) > 0 ? (
              <div>
                <p className="text-sm text-muted-foreground">{isAr ? 'القيمة' : 'Amount'}</p>
                <p className="font-display text-lg font-semibold tabular-nums">
                  {formatMoney(
                    decimalToNumber(subscription.amount),
                    subscription.currency,
                    locale,
                  )}
                </p>
              </div>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/dash/billing">{isAr ? 'إدارة الاشتراك' : 'Manage plan'}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <TrainerSection
        title={isAr ? 'حدود خطتك' : 'Your plan limits'}
        description={
          isAr
            ? 'الاستهلاك الحالي مقابل ما تسمح به خطتك.'
            : 'What you are using against what your plan allows.'
        }
      >
        <QuotaGrid quotas={quotas} locale={locale} />
      </TrainerSection>

      <TrainerSection title={isAr ? 'خطواتك التالية' : 'Your next steps'}>
        <div className="grid gap-4 md:grid-cols-3">
          {nextSteps.map((step) => (
            <Card
              key={step.en}
              className="transition-all duration-element ease-brand hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift"
            >
              <Link href={step.href}>
                <CardContent className="space-y-2 p-5">
                  <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <step.icon className="size-5" />
                  </span>
                  <p className="font-medium">
                    {isAr ? step.ar : step.en}
                    {step.done ? (
                      <Badge variant="success" className="ms-2 align-middle text-[11px]">
                        {isAr ? 'تم' : 'Done'}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {isAr ? step.descAr : step.descEn}
                  </p>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      </TrainerSection>

      {/* Honest about what is not built yet, rather than faking a widget. */}
      {traineeCount === 0 ? (
        <EmptyState
          icon={<Users />}
          title={isAr ? 'لسه مفيش متدربين' : 'No trainees yet'}
          description={
            isAr
              ? 'أول ما تضيف متدرب هتلاقي هنا التزامه، برنامجه، وميعاد تجديده.'
              : 'Once you add a trainee, their adherence, program and renewal date show up here.'
          }
          action={
            <Button size="sm" asChild>
              <Link href="/dash/trainees">{isAr ? 'أضف متدرب' : 'Add a trainee'}</Link>
            </Button>
          }
        />
      ) : null}
    </TrainerPage>
  );
}

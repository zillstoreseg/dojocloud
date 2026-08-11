import { setRequestLocale, getTranslations } from 'next-intl/server';
import { BadgeCheck, FileCheck2, Receipt, Users } from 'lucide-react';
import { requireAdminPage } from '@/lib/authz';
import { countryLabel } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { getPendingCounts } from '@/lib/admin/counts';
import { formatMoney, decimalToNumber } from '@/lib/money';
import { AdminPage } from '@/components/admin/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';
import { ReviewActions, FilePreview } from './review-actions';

export default async function ActivationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('approvals.trainers', locale);

  const isAr = locale === 'ar';
  const tSpecialty = await getTranslations('specialties');

  const [counts, trainers, certificates, payments, traineeSubs] = await Promise.all([
    getPendingCounts(),
    prisma.trainerProfile.findMany({
      where: { approvalStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { email: true, createdAt: true } },
        certificates: { select: { id: true, title: true, issuer: true, year: true, fileUrl: true, status: true } },
      },
    }),
    prisma.certificate.findMany({
      where: { status: 'PENDING', trainer: { approvalStatus: { not: 'PENDING' } } },
      orderBy: { createdAt: 'asc' },
      include: { trainer: { select: { fullName: true, username: true } } },
    }),
    prisma.payment.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        subscription: {
          include: {
            plan: { select: { nameAr: true, nameEn: true, interval: true } },
            trainer: { select: { fullName: true, username: true, phone: true } },
          },
        },
      },
    }),
    prisma.traineeSubscription.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        package: { select: { name: true, durationDays: true } },
        trainee: { select: { fullName: true, phone: true, trainer: { select: { fullName: true } } } },
      },
    }),
  ]);

  const empty = (text: string) => (
    <Card>
      <CardContent className="py-16 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );

  const tabBadge = (n: number) =>
    n > 0 ? (
      <Badge variant="destructive" className="ms-1 h-5 min-w-5 justify-center px-1.5 text-[11px]">
        {n}
      </Badge>
    ) : null;

  return (
    <AdminPage
      title={isAr ? 'مركز التفعيلات' : 'Activations centre'}
      description={
        isAr
          ? 'كل ما ينتظر قرارك: اعتماد المدربين، مراجعة الشهادات، وتفعيل المدفوعات.'
          : 'Everything awaiting your decision: trainer approvals, certificate review, and payment activation.'
      }
    >
      <Tabs defaultValue="trainers">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="trainers">
            <BadgeCheck className="size-4" />
            {isAr ? 'المدربون' : 'Trainers'}
            {tabBadge(counts.trainers)}
          </TabsTrigger>
          <TabsTrigger value="certificates">
            <FileCheck2 className="size-4" />
            {isAr ? 'الشهادات' : 'Certificates'}
            {tabBadge(counts.certificates)}
          </TabsTrigger>
          <TabsTrigger value="payments">
            <Receipt className="size-4" />
            {isAr ? 'المدفوعات' : 'Payments'}
            {tabBadge(counts.payments)}
          </TabsTrigger>
          <TabsTrigger value="trainees">
            <Users className="size-4" />
            {isAr ? 'اشتراكات المتدربين' : 'Trainee subs'}
            {tabBadge(counts.traineePayments)}
          </TabsTrigger>
        </TabsList>

        {/* ── Trainer approvals ─────────────────────────────────────────── */}
        <TabsContent value="trainers" className="space-y-4">
          {trainers.length === 0
            ? empty(isAr ? 'لا توجد طلبات اعتماد معلّقة' : 'No pending trainer approvals')
            : trainers.map((trainer) => (
                <Card key={trainer.id}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <Avatar className="size-12">
                          {trainer.avatarUrl ? <AvatarImage src={trainer.avatarUrl} alt="" /> : null}
                          <AvatarFallback>{initials(trainer.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <p className="font-semibold">{trainer.fullName}</p>
                          <p className="text-sm text-muted-foreground" dir="ltr">
                            {trainer.user.email} · {trainer.phone}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {countryLabel(trainer.country, locale)}
                            {trainer.city ? ` — ${trainer.city}` : ''} ·{' '}
                            {isAr ? `${trainer.yearsExperience} سنة خبرة` : `${trainer.yearsExperience}y experience`}
                          </p>
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            /c/{trainer.username}
                          </p>
                        </div>
                      </div>
                      <ReviewActions
                        kind="trainer"
                        id={trainer.id}
                        itemLabel={isAr ? 'حساب المدرب' : 'trainer account'}
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {trainer.specialties.map((s) => (
                        <Badge key={s} variant="secondary">
                          {tSpecialty(s)}
                        </Badge>
                      ))}
                      <Badge variant="outline">
                        {trainer.trainsGenders === 'BOTH'
                          ? isAr ? 'يدرب رجال وسيدات' : 'Trains men & women'
                          : trainer.trainsGenders === 'MALE'
                            ? isAr ? 'يدرب رجال' : 'Trains men'
                            : isAr ? 'يدرب سيدات' : 'Trains women'}
                      </Badge>
                    </div>

                    {trainer.bio ? (
                      <p className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed">{trainer.bio}</p>
                    ) : null}

                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {isAr ? `الشهادات (${trainer.certificates.length})` : `Certificates (${trainer.certificates.length})`}
                      </p>
                      {trainer.certificates.length === 0 ? (
                        <p className="text-sm text-destructive">
                          {isAr ? 'لم يرفع أي شهادات' : 'No certificates uploaded'}
                        </p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {trainer.certificates.map((cert) => (
                            <div
                              key={cert.id}
                              className="flex items-center justify-between gap-3 rounded-md border p-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{cert.title}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {[cert.issuer, cert.year].filter(Boolean).join(' · ') || '—'}
                                </p>
                              </div>
                              <FilePreview url={cert.fileUrl} label={cert.title} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
        </TabsContent>

        {/* ── Standalone certificate review ─────────────────────────────── */}
        <TabsContent value="certificates" className="space-y-3">
          {certificates.length === 0
            ? empty(isAr ? 'لا توجد شهادات بانتظار المراجعة' : 'No certificates awaiting review')
            : certificates.map((cert) => (
                <Card key={cert.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{cert.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {cert.trainer.fullName} · {[cert.issuer, cert.year].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <FilePreview url={cert.fileUrl} label={cert.title} />
                      <ReviewActions
                        kind="certificate"
                        id={cert.id}
                        itemLabel={isAr ? 'الشهادة' : 'certificate'}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
        </TabsContent>

        {/* ── Payment activation ────────────────────────────────────────── */}
        <TabsContent value="payments" className="space-y-3">
          {payments.length === 0
            ? empty(isAr ? 'لا توجد مدفوعات بانتظار التفعيل' : 'No payments awaiting activation')
            : payments.map((payment) => (
                <Card key={payment.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{payment.subscription.trainer.fullName}</p>
                        <Badge variant="secondary">
                          {isAr ? payment.subscription.plan.nameAr : payment.subscription.plan.nameEn}
                        </Badge>
                      </div>
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {formatMoney(decimalToNumber(payment.amount), payment.currency, locale)}
                      </p>
                      <p className="text-sm text-muted-foreground" dir="ltr">
                        {payment.subscription.trainer.phone}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.method}
                        {payment.reference ? ` · ${payment.reference}` : ''} ·{' '}
                        {payment.createdAt.toLocaleDateString(isAr ? 'ar-EG-u-nu-latn' : 'en-US')}
                      </p>
                      {payment.payerNote ? (
                        <p className="rounded bg-muted/50 p-2 text-sm">{payment.payerNote}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {payment.receiptUrl ? (
                        <FilePreview url={payment.receiptUrl} label={isAr ? 'إيصال الدفع' : 'Payment receipt'} />
                      ) : (
                        <Badge variant="warning">{isAr ? 'بدون إيصال' : 'No receipt'}</Badge>
                      )}
                      <ReviewActions
                        kind="payment"
                        id={payment.id}
                        itemLabel={isAr ? 'الدفعة' : 'payment'}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
        </TabsContent>

        {/* ── Trainee subscriptions ─────────────────────────────────────── */}
        <TabsContent value="trainees" className="space-y-3">
          {traineeSubs.length === 0
            ? empty(isAr ? 'لا توجد اشتراكات متدربين معلّقة' : 'No pending trainee subscriptions')
            : traineeSubs.map((sub) => (
                <Card key={sub.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold">{sub.trainee.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {isAr ? 'المدرب: ' : 'Coach: '}
                        {sub.trainee.trainer.fullName} · {sub.package.name} (
                        {isAr ? `${sub.package.durationDays} يوم` : `${sub.package.durationDays} days`})
                      </p>
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {formatMoney(decimalToNumber(sub.amount), sub.currency, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {sub.receiptUrl ? (
                        <FilePreview url={sub.receiptUrl} label={isAr ? 'إيصال الدفع' : 'Payment receipt'} />
                      ) : null}
                      <ReviewActions
                        kind="traineeSubscription"
                        id={sub.id}
                        itemLabel={isAr ? 'اشتراك المتدرب' : 'trainee subscription'}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

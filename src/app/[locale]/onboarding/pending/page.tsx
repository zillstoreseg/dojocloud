import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { BadgeCheck, Clock, FileText, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requireTrainerPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { AuthShell } from '@/components/auth/auth-shell';
import { StepperHeader } from '@/components/ui/stepper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SignOutButton } from './sign-out-button';

export default async function PendingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireTrainerPage(locale);

  const isAr = locale === 'ar';
  const [brand, profile] = await Promise.all([
    getBrand(),
    prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: {
        fullName: true,
        username: true,
        approvalStatus: true,
        rejectionReason: true,
        createdAt: true,
        certificates: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, reviewNote: true },
        },
      },
    }),
  ]);

  if (!profile) redirect(`/${locale}/login`);
  if (profile.approvalStatus === 'APPROVED') redirect(`/${locale}/dash`);

  // Nothing to review yet — send them back to the step that produces it.
  if (profile.certificates.length === 0) redirect(`/${locale}/onboarding/certificates`);

  const rejected = profile.approvalStatus === 'REJECTED';

  return (
    <AuthShell
      brandName={brand.name}
      title={
        rejected
          ? isAr
            ? 'محتاجين تعديل بسيط'
            : 'A few changes needed'
          : isAr
            ? 'طلبك تحت المراجعة'
            : 'Your application is under review'
      }
      description={
        rejected
          ? isAr
            ? 'راجع الملاحظات تحت، عدّل شهاداتك، وأعد الإرسال.'
            : 'Read the notes below, fix your certificates, and resubmit.'
          : isAr
            ? 'الإدارة بتراجع شهاداتك. هيوصلك إشعار أول ما تخلص المراجعة.'
            : 'An admin is reviewing your certificates. You will be notified as soon as it is done.'
      }
      width="lg"
      footer={<SignOutButton locale={locale} label={isAr ? 'تسجيل الخروج' : 'Sign out'} />}
    >
      <StepperHeader
        steps={[
          { key: 'account', label: isAr ? 'الحساب' : 'Account' },
          { key: 'certificates', label: isAr ? 'الشهادات' : 'Certificates' },
          { key: 'review', label: isAr ? 'المراجعة' : 'Review' },
        ]}
        current={2}
      />

      {rejected ? (
        <Alert variant="destructive">
          <XCircle />
          <div>
            <AlertTitle>{isAr ? 'سبب الرفض' : 'Reason for rejection'}</AlertTitle>
            <AlertDescription>
              {profile.rejectionReason ||
                (isAr
                  ? 'لم تُذكر أسباب. راجع شهاداتك وتأكد أنها واضحة وسارية.'
                  : 'No reason was given. Check that your certificates are legible and valid.')}
            </AlertDescription>
          </div>
        </Alert>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-4 p-6">
            {/* A quiet pulse, not a spinner: nothing is loading, something is
                being waited on. */}
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/30" aria-hidden />
              <Clock className="relative size-5" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">
                {isAr ? 'عادةً خلال ٢٤–٤٨ ساعة' : 'Usually within 24–48 hours'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? 'بعد الاعتماد هتختار خطتك، وبعدها تفتح لوحة التحكم وتبدأ تبني صفحتك.'
                  : 'Once approved you will choose your plan, then your dashboard opens and you can start building your page.'}
              </p>
              <p className="pt-2 text-sm text-muted-foreground" dir="ltr">
                coachmate.app/c/{profile.username}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{isAr ? 'شهاداتك' : 'Your certificates'}</p>
            <Badge variant="muted">{profile.certificates.length}</Badge>
          </div>
          <ul className="space-y-2">
            {profile.certificates.map((certificate) => (
              <li
                key={certificate.id}
                className="flex items-center gap-3 rounded-md border border-border/60 p-3"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{certificate.title}</p>
                  {certificate.reviewNote ? (
                    <p className="truncate text-xs text-destructive">{certificate.reviewNote}</p>
                  ) : null}
                </div>
                <Badge
                  variant={
                    certificate.status === 'APPROVED'
                      ? 'success'
                      : certificate.status === 'REJECTED'
                        ? 'destructive'
                        : 'warning'
                  }
                >
                  {certificate.status === 'APPROVED' ? (
                    <>
                      <BadgeCheck className="size-3" />
                      {isAr ? 'معتمدة' : 'Approved'}
                    </>
                  ) : certificate.status === 'REJECTED' ? (
                    isAr ? (
                      'مرفوضة'
                    ) : (
                      'Rejected'
                    )
                  ) : isAr ? (
                    'قيد المراجعة'
                  ) : (
                    'Under review'
                  )}
                </Badge>
              </li>
            ))}
          </ul>

          <Button variant="outline" asChild className="w-full">
            <Link href="/onboarding/certificates">
              {rejected
                ? isAr
                  ? 'عدّل شهاداتك وأعد الإرسال'
                  : 'Fix your certificates and resubmit'
                : isAr
                  ? 'إضافة شهادة أخرى'
                  : 'Add another certificate'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

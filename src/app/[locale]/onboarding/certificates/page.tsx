import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { requireTrainerPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { AuthShell } from '@/components/auth/auth-shell';
import { StepperHeader } from '@/components/ui/stepper';
import { CertificateManager, type CertificateRow } from './certificate-manager';

export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireTrainerPage(locale);

  // An approved trainer has no reason to be back in onboarding; managing
  // certificates after approval belongs in the dashboard.
  if (user.approvalStatus === 'APPROVED') redirect(`/${locale}/dash`);

  const isAr = locale === 'ar';
  const [brand, certificates, profile] = await Promise.all([
    getBrand(),
    prisma.certificate.findMany({
      where: { trainerId: user.trainerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        issuer: true,
        year: true,
        fileUrl: true,
        status: true,
        reviewNote: true,
      },
    }),
    prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { approvalStatus: true, rejectionReason: true },
    }),
  ]);

  const isResubmission = profile?.approvalStatus === 'REJECTED';

  return (
    <AuthShell
      brandName={brand.name}
      title={isAr ? 'ارفع شهاداتك' : 'Upload your certificates'}
      description={
        isAr
          ? 'الشهادات هي اللي بتخلي المتدرب يثق فيك — وهي شرط اعتماد حسابك.'
          : 'Certificates are what earn a trainee’s trust — and they are required to approve your account.'
      }
      width="xl"
    >
      <StepperHeader
        steps={[
          { key: 'account', label: isAr ? 'الحساب' : 'Account' },
          { key: 'certificates', label: isAr ? 'الشهادات' : 'Certificates' },
          { key: 'review', label: isAr ? 'المراجعة' : 'Review' },
        ]}
        current={1}
      />

      <CertificateManager
        locale={locale}
        certificates={certificates as CertificateRow[]}
        isResubmission={isResubmission}
        labels={
          isAr
            ? {
                dropzone: 'اسحب ملف الشهادة هنا أو اضغط للاختيار',
                dropzoneHint: 'صورة أو PDF',
                certTitle: 'اسم الشهادة',
                certTitlePlaceholder: 'مثال: مدرب شخصي معتمد',
                certIssuer: 'الجهة المانحة',
                certIssuerPlaceholder: 'مثال: NASM',
                certYear: 'سنة الحصول',
                addCertificate: 'أضف الشهادة',
                pickFile: 'اختر ملف الشهادة أولًا',
                needTitle: 'اكتب اسم الشهادة',
                noIssuer: 'بدون جهة مانحة',
                view: 'عرض',
                remove: 'حذف',
                statusPENDING: 'قيد المراجعة',
                statusAPPROVED: 'معتمدة',
                statusREJECTED: 'مرفوضة',
                emptyTitle: 'لسه ما رفعتش أي شهادة',
                emptyDescription: 'ارفع شهادة واحدة على الأقل عشان تقدر تكمّل. تقدر تضيف غيرها في أي وقت.',
                reviewNotice: 'تقدر تضيف شهادات إضافية بعد الاعتماد من لوحة التحكم.',
                finish: 'أرسل للمراجعة',
                resubmit: 'أعد الإرسال للمراجعة',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
              }
            : {
                dropzone: 'Drag a certificate here, or click to choose',
                dropzoneHint: 'Image or PDF',
                certTitle: 'Certificate name',
                certTitlePlaceholder: 'e.g. Certified Personal Trainer',
                certIssuer: 'Issuing body',
                certIssuerPlaceholder: 'e.g. NASM',
                certYear: 'Year',
                addCertificate: 'Add certificate',
                pickFile: 'Choose a file first',
                needTitle: 'Give the certificate a name',
                noIssuer: 'No issuer given',
                view: 'View',
                remove: 'Remove',
                statusPENDING: 'Under review',
                statusAPPROVED: 'Approved',
                statusREJECTED: 'Rejected',
                emptyTitle: 'No certificates yet',
                emptyDescription: 'Upload at least one to continue. You can add more at any time.',
                reviewNotice: 'You can add more certificates from your dashboard after approval.',
                finish: 'Submit for review',
                resubmit: 'Resubmit for review',
                generic: 'Something went wrong, please try again',
              }
        }
      />
    </AuthShell>
  );
}

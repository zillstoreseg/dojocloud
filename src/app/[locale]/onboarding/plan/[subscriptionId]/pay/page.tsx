import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { transferInstructions } from '@/lib/payments/manual';
import { formatMoney, decimalToNumber } from '@/lib/money';
import { AuthShell } from '@/components/auth/auth-shell';
import { StepperHeader } from '@/components/ui/stepper';
import { Card, CardContent } from '@/components/ui/card';
import { ReceiptForm } from './receipt-form';

export default async function PayPage({
  params,
}: {
  params: Promise<{ locale: string; subscriptionId: string }>;
}) {
  const { locale, subscriptionId } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale, ['needs-payment']);
  const isAr = locale === 'ar';

  // Scoped read: the subscription must belong to the signed-in trainer.
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, trainerId: user.trainerId },
    include: { plan: { select: { nameAr: true, nameEn: true, interval: true } } },
  });
  if (!subscription) notFound();

  const [brand, instructions] = await Promise.all([getBrand(), transferInstructions()]);
  const amount = decimalToNumber(subscription.amount);

  return (
    <AuthShell
      brandName={brand.name}
      title={isAr ? 'ادفع وارفع الإيصال' : 'Pay and upload your receipt'}
      description={
        isAr
          ? 'حوّل المبلغ بأي وسيلة تحت، وارفع صورة الإيصال — الإدارة تراجعه وتفعّل اشتراكك.'
          : 'Transfer the amount using any method below and upload the receipt — an admin verifies it and activates your subscription.'
      }
      width="lg"
    >
      <StepperHeader
        steps={[
          { key: 'plan', label: isAr ? 'الخطة' : 'Plan' },
          { key: 'pay', label: isAr ? 'الدفع' : 'Payment' },
          { key: 'review', label: isAr ? 'التفعيل' : 'Activation' },
        ]}
        current={1}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'الخطة المختارة' : 'Selected plan'}</p>
            <p className="font-display text-lg font-semibold">
              {isAr ? subscription.plan.nameAr : subscription.plan.nameEn}
            </p>
          </div>
          <div className="text-end">
            <p className="text-sm text-muted-foreground">{isAr ? 'المبلغ المطلوب' : 'Amount due'}</p>
            <p className="font-display text-2xl font-semibold tabular-nums text-primary">
              {formatMoney(amount, subscription.currency, locale)}
            </p>
          </div>
        </CardContent>
      </Card>

      <ReceiptForm
        locale={locale}
        subscriptionId={subscription.id}
        instructions={{
          text: isAr ? instructions.textAr : instructions.textEn,
          accounts: instructions.accounts.map((account) => ({
            label: isAr ? account.labelAr : account.labelEn,
            value: account.value,
          })),
        }}
        labels={
          isAr
            ? {
                transferTo: 'حوّل إلى',
                copied: 'تم النسخ',
                noAccounts: 'لم تُضبط بيانات التحويل بعد — تواصل مع الإدارة.',
                uploadReceipt: 'ارفع إيصال التحويل',
                dropzone: 'اسحب صورة الإيصال هنا أو اضغط للاختيار',
                dropzoneHint: 'صورة واضحة يظهر فيها المبلغ والتاريخ',
                method: 'وسيلة التحويل',
                methodInstapay: 'إنستاباي',
                methodVodafone: 'فودافون كاش',
                methodBank: 'تحويل بنكي',
                methodOther: 'أخرى',
                reference: 'رقم العملية (اختياري)',
                referenceHint: 'يسرّع المراجعة',
                pickFile: 'ارفع صورة الإيصال أولًا',
                submit: 'أرسل الإيصال للمراجعة',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
              }
            : {
                transferTo: 'Transfer to',
                copied: 'Copied',
                noAccounts: 'No transfer details have been configured yet — contact the administration.',
                uploadReceipt: 'Upload your transfer receipt',
                dropzone: 'Drag the receipt here, or click to choose',
                dropzoneHint: 'A clear image showing the amount and date',
                method: 'Transfer method',
                methodInstapay: 'InstaPay',
                methodVodafone: 'Vodafone Cash',
                methodBank: 'Bank transfer',
                methodOther: 'Other',
                reference: 'Transaction reference (optional)',
                referenceHint: 'Speeds up the review',
                pickFile: 'Upload the receipt first',
                submit: 'Submit for review',
                generic: 'Something went wrong, please try again',
              }
        }
      />
    </AuthShell>
  );
}

import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { currencyForCountry } from '@/lib/countries';
import { SUPPORTED_CURRENCIES, planPrice } from '@/lib/money';
import { AuthShell } from '@/components/auth/auth-shell';
import { StepperHeader } from '@/components/ui/stepper';
import { PlanPicker, type PlanOption } from './plan-picker';

export default async function ChoosePlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // This screen is the fix for `needs-plan`, so it must not bounce itself.
  const { user } = await requireTrainerStage(locale, ['needs-plan']);
  const isAr = locale === 'ar';

  const [brand, plans, profile] = await Promise.all([
    getBrand(),
    prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { country: true },
    }),
  ]);

  const options: PlanOption[] = plans.map((plan) => {
    const highlights = (plan.highlights as { ar?: string[]; en?: string[] } | null) ?? {};
    return {
      id: plan.id,
      key: plan.key,
      name: isAr ? plan.nameAr : plan.nameEn,
      tagline: isAr ? plan.taglineAr : plan.taglineEn,
      // Resolved here so the client never has to understand the price map.
      prices: Object.fromEntries(
        SUPPORTED_CURRENCIES.map((currency) => [currency, planPrice(plan.prices, currency)]),
      ),
      interval: plan.interval,
      trialDays: plan.trialDays,
      isPopular: plan.isPopular,
      highlights: (isAr ? highlights.ar : highlights.en) ?? [],
    };
  });

  return (
    <AuthShell
      brandName={brand.name}
      title={isAr ? 'اختر خطتك' : 'Choose your plan'}
      description={
        isAr
          ? 'حسابك معتمد ✅ — فاضل تختار خطة وتبدأ. تقدر تغيّرها في أي وقت.'
          : 'Your account is approved ✅ — pick a plan and get started. You can change it any time.'
      }
      width="wide"
    >
      <StepperHeader
        steps={[
          { key: 'account', label: isAr ? 'الحساب' : 'Account' },
          { key: 'certificates', label: isAr ? 'الشهادات' : 'Certificates' },
          { key: 'plan', label: isAr ? 'الخطة' : 'Plan' },
        ]}
        current={2}
      />

      <PlanPicker
        locale={locale}
        plans={options}
        currencies={[...SUPPORTED_CURRENCIES]}
        defaultCurrency={currencyForCountry(profile?.country ?? 'EG')}
        labels={
          isAr
            ? {
                currency: 'العملة',
                mostPopular: 'الأكثر اختيارًا',
                free: 'مجانًا',
                perMonth: 'شهريًا',
                trialFor: 'تجربة {days} يوم بدون بطاقة ائتمان',
                coupon: 'كود خصم',
                couponPlaceholder: 'اكتب الكود',
                apply: 'تطبيق',
                discountApplied: 'تم خصم {amount}',
                total: 'الإجمالي',
                startTrial: 'ابدأ التجربة',
                continueToPayment: 'متابعة للدفع',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
              }
            : {
                currency: 'Currency',
                mostPopular: 'Most popular',
                free: 'Free',
                perMonth: 'month',
                trialFor: '{days}-day trial, no credit card',
                coupon: 'Discount code',
                couponPlaceholder: 'Enter code',
                apply: 'Apply',
                discountApplied: '{amount} off applied',
                total: 'Total',
                startTrial: 'Start trial',
                continueToPayment: 'Continue to payment',
                generic: 'Something went wrong, please try again',
              }
        }
      />
    </AuthShell>
  );
}

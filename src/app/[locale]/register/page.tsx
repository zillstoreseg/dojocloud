import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { getBrand, getSetting } from '@/lib/settings';
import { SPECIALTY_KEYS, specialtyLabel } from '@/lib/specialties';
import { COUNTRIES, countryLabel } from '@/lib/countries';
import { AuthShell } from '@/components/auth/auth-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RegisterWizard } from './register-wizard';

export const metadata: Metadata = {
  title: 'إنشاء حساب مدرب',
};

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Someone already signed in has no business on the sign-up screen.
  const session = await auth();
  if (session?.user) redirect(`/${locale}/redirect`);

  const isAr = locale === 'ar';
  const [brand, signupOpen] = await Promise.all([
    getBrand(),
    getSetting('app.allow_trainer_signup'),
  ]);

  if (signupOpen === 'false') {
    return (
      <AuthShell
        brandName={brand.name}
        title={isAr ? 'التسجيل متوقف مؤقتًا' : 'Sign-up is paused'}
      >
        <Alert variant="warning">
          <AlertTitle>{isAr ? 'نستقبل مدربين قريبًا' : 'We are reopening soon'}</AlertTitle>
          <AlertDescription>
            {isAr
              ? 'تسجيل المدربين متوقف حاليًا من الإدارة. جرّب مرة أخرى بعد فترة.'
              : 'Trainer sign-up is currently closed by the administration. Please try again later.'}
          </AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      brandName={brand.name}
      title={isAr ? 'أنشئ حسابك كمدرب' : 'Create your coach account'}
      description={
        isAr
          ? 'أربع خطوات قصيرة، وبعدها ترفع شهاداتك للمراجعة.'
          : 'Four short steps, then you upload your certificates for review.'
      }
      width="lg"
      footer={
        <>
          {isAr ? 'عندك حساب بالفعل؟' : 'Already have an account?'}{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {isAr ? 'سجّل الدخول' : 'Sign in'}
          </Link>
        </>
      }
    >
      <RegisterWizard
        locale={locale}
        options={{
          specialties: SPECIALTY_KEYS.map((key) => ({
            value: key,
            label: specialtyLabel(key, locale),
          })),
          countries: COUNTRIES.map((country) => ({
            value: country.code,
            label: countryLabel(country.code, locale),
            dial: country.dial,
          })),
        }}
        labels={
          isAr
            ? {
                stepAccount: 'بياناتك',
                stepExpertise: 'تخصصك',
                stepContact: 'التواصل',
                stepHandle: 'رابطك',
                fullName: 'الاسم بالكامل',
                gender: 'النوع',
                male: 'ذكر',
                female: 'أنثى',
                email: 'البريد الإلكتروني',
                password: 'كلمة المرور',
                passwordHint: '8 أحرف على الأقل',
                confirmPassword: 'تأكيد كلمة المرور',
                specialties: 'تخصصاتك',
                specialtiesHint: 'اختر من واحد إلى ستة تخصصات — دي اللي هيتفلتر بيها الزوار عليك في الدليل',
                yearsExperience: 'سنوات الخبرة',
                trainsGenders: 'بتدرّب مين؟',
                trainsMen: 'رجال',
                trainsWomen: 'سيدات',
                trainsBoth: 'الاثنين',
                country: 'الدولة',
                selectCountry: 'اختر الدولة',
                phone: 'رقم الهاتف',
                phoneHint: 'مفتاح دولتك',
                city: 'المدينة (اختياري)',
                username: 'رابط صفحتك',
                usernameHint: 'حروف إنجليزية صغيرة وأرقام وشرطة، من 3 إلى 30 حرفًا. ده الرابط اللي هتشاركه على السوشيال.',
                usernameTaken: 'الاسم محجوز. جرّب:',
                bio: 'نبذة عنك (اختياري)',
                bioHint: 'تقدر تكتبها لاحقًا من لوحة التحكم.',
                referralCode: 'كود دعوة (اختياري)',
                referralCodeHint: 'لو مدرب دعاك، اكتب كوده — وهتاخدوا الاتنين شهر مجاني.',
                reviewNotice:
                  'بعد التسجيل هترفع شهاداتك، وهتتراجع وتُعتمد من الإدارة قبل ما حسابك يشتغل. هيوصلك إشعار أول ما تخلص المراجعة.',
                back: 'رجوع',
                next: 'التالي',
                submit: 'إنشاء الحساب',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
              }
            : {
                stepAccount: 'Your details',
                stepExpertise: 'Expertise',
                stepContact: 'Contact',
                stepHandle: 'Your link',
                fullName: 'Full name',
                gender: 'Gender',
                male: 'Male',
                female: 'Female',
                email: 'Email',
                password: 'Password',
                passwordHint: 'At least 8 characters',
                confirmPassword: 'Confirm password',
                specialties: 'Your specialties',
                specialtiesHint: 'Pick one to six — these are what visitors filter by in the directory',
                yearsExperience: 'Years of experience',
                trainsGenders: 'Who do you train?',
                trainsMen: 'Men',
                trainsWomen: 'Women',
                trainsBoth: 'Both',
                country: 'Country',
                selectCountry: 'Select a country',
                phone: 'Phone number',
                phoneHint: 'Your dial code',
                city: 'City (optional)',
                username: 'Your page link',
                usernameHint: 'Lowercase letters, numbers and dashes, 3–30 characters. This is the link you share on social media.',
                usernameTaken: 'That handle is taken. Try:',
                bio: 'Short bio (optional)',
                bioHint: 'You can write this later from your dashboard.',
                referralCode: 'Invite code (optional)',
                referralCodeHint: 'If a coach invited you, enter their code — you both get a free month.',
                reviewNotice:
                  'After signing up you will upload your certificates. An admin reviews and approves them before your account goes live, and you will be notified as soon as the review is done.',
                back: 'Back',
                next: 'Next',
                submit: 'Create account',
                generic: 'Something went wrong, please try again',
              }
        }
      />
    </AuthShell>
  );
}

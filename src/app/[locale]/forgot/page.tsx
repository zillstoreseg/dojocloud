import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getBrand } from '@/lib/settings';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotForm } from './forgot-form';

export default async function ForgotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const brand = await getBrand();
  const isAr = locale === 'ar';

  return (
    <AuthShell
      brandName={brand.name}
      title={isAr ? 'نسيت كلمة السر؟' : 'Forgot your password?'}
      description={
        isAr
          ? 'اكتب بريدك وهنبعتلك رابط تحدّد بيه كلمة سر جديدة.'
          : 'Enter your email and we’ll send you a link to set a new one.'
      }
      footer={
        <p className="text-center text-sm text-muted-foreground">
          {isAr ? 'فاكرها؟ ' : 'Remembered it? '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {isAr ? 'سجّل الدخول' : 'Sign in'}
          </Link>
        </p>
      }
    >
      <ForgotForm locale={locale} />
    </AuthShell>
  );
}

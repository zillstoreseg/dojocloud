import { setRequestLocale } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getBrand } from '@/lib/settings';
import { verifyResetToken } from '@/lib/password-reset';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { ResetForm } from './reset-form';

/**
 * The token is checked before the form renders.
 *
 * Collecting a new password and only then saying "this link expired" wastes
 * the one thing the visitor came to do, and does it after they have already
 * chosen and typed a password twice.
 */
export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);

  const brand = await getBrand();
  const isAr = locale === 'ar';

  const check = await verifyResetToken(token ?? '');

  if (!check.ok) {
    const reason = {
      INVALID: {
        ar: 'الرابط ده مش صالح — يمكن اتنسخ ناقص.',
        en: 'This link is not valid — it may have been copied incompletely.',
      },
      EXPIRED: {
        ar: 'الرابط ده انتهت صلاحيته. الروابط بتشتغل لمدة ساعة واحدة بس.',
        en: 'This link has expired. Reset links are valid for one hour.',
      },
      USED: {
        ar: 'الرابط ده اتستخدم قبل كده. كل رابط بيشتغل مرة واحدة.',
        en: 'This link has already been used. Each link works once.',
      },
      WEAK: { ar: '', en: '' },
    }[check.reason];

    return (
      <AuthShell
        brandName={brand.name}
        title={isAr ? 'الرابط مش شغّال' : 'This link doesn’t work'}
        description={isAr ? reason.ar : reason.en}
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="size-7" />
          </div>
          <Button asChild className="w-full">
            <Link href="/forgot">{isAr ? 'اطلب رابط جديد' : 'Request a new link'}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      brandName={brand.name}
      title={isAr ? 'حدّد كلمة سر جديدة' : 'Set a new password'}
      description={
        isAr
          ? 'اختار كلمة سر جديدة، وهتقدر تسجّل دخولك بيها على طول.'
          : 'Choose a new password and sign in with it straight away.'
      }
    >
      <ResetForm locale={locale} token={token!} />
    </AuthShell>
  );
}

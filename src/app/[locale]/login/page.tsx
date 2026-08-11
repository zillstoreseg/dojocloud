import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getBrand } from '@/lib/settings';
import { LoginForm } from './login-form';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { next, error } = await searchParams;
  setRequestLocale(locale);

  const [t, tAuth, brand] = await Promise.all([
    getTranslations('common'),
    getTranslations('auth'),
    getBrand(),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="text-2xl font-bold text-primary">
            {brand.name}
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{tAuth('loginTitle')}</CardTitle>
            <CardDescription>{tAuth('loginSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm
              nextUrl={next ?? null}
              initialError={error === 'suspended' ? tAuth('accountSuspended') : null}
              labels={{
                email: tAuth('emailLabel'),
                password: tAuth('passwordLabel'),
                submit: tAuth('loginButton'),
                invalid: tAuth('invalidCredentials'),
                suspended: tAuth('accountSuspended'),
                generic: t('errorGeneric'),
              }}
            />
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          {tAuth('noAccount')}{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {tAuth('registerButton')}
          </Link>
        </p>
      </div>
    </main>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  nextUrl: string | null;
  initialError: string | null;
  labels: {
    email: string;
    password: string;
    submit: string;
    invalid: string;
    suspended: string;
    generic: string;
  };
}

export function LoginForm({ nextUrl, initialError, labels }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirect: false,
    });

    if (result?.error) {
      setError(result.error.includes('SUSPENDED') ? labels.suspended : labels.invalid);
      return;
    }

    startTransition(() => {
      // The post-login landing page depends on the role, so we route through a
      // server component that reads the session and forwards accordingly.
      router.push(nextUrl ?? `/${locale}/redirect`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Field label={labels.email} htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
      </Field>

      <Field label={labels.password} htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
      </Field>

      <Button type="submit" className="w-full" loading={pending}>
        {labels.submit}
      </Button>
    </form>
  );
}

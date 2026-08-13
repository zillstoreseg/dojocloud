'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { resetPassword } from './actions';

export function ResetForm({ locale, token }: { locale: string; token: string }) {
  const isAr = locale === 'ar';
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    start(async () => {
      const result = await resetPassword({ token, password, confirmPassword, locale });
      if (!result.ok) {
        setError(result.error ?? (isAr ? 'حصل خطأ' : 'Something went wrong'));
        return;
      }
      setDone(true);
      // A moment to read the confirmation before the login screen replaces it.
      setTimeout(() => router.push('/login'), 1800);
    });
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-7" />
        </div>
        <p className="font-display text-lg font-semibold">
          {isAr ? 'اتغيّرت كلمة السر' : 'Password changed'}
        </p>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'بنوديك لصفحة الدخول…' : 'Taking you to sign in…'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Field
        label={isAr ? 'كلمة السر الجديدة' : 'New password'}
        htmlFor="password"
        required
        hint={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
      >
        <Input
          id="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Field label={isAr ? 'تأكيد كلمة السر' : 'Confirm password'} htmlFor="confirm" required>
        <Input
          id="confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        {isAr ? 'احفظ كلمة السر' : 'Save password'}
      </Button>
    </form>
  );
}

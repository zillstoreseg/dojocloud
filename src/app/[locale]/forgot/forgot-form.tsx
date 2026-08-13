'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { sendResetLink } from './actions';

export function ForgotForm({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    start(async () => {
      const result = await sendResetLink({ email, locale });
      if (!result.ok) {
        setError(result.error ?? (isAr ? 'حصل خطأ' : 'Something went wrong'));
        return;
      }
      setSent(true);
    });
  }

  // The confirmation is deliberately vague about whether the address exists.
  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-7" />
        </div>
        <div className="space-y-1">
          <p className="font-display text-lg font-semibold">
            {isAr ? 'بصّ في بريدك' : 'Check your inbox'}
          </p>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'لو في حساب مسجّل بالبريد ده، هيوصله رابط لتحديد كلمة سر جديدة. الرابط صالح لساعة واحدة.'
              : 'If an account exists for that address, a reset link is on its way. It’s valid for one hour.'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? 'مش لاقيه؟ شوف في الـ spam قبل ما تطلب تاني.'
            : 'Not there? Check spam before requesting another.'}
        </p>
      </div>
    );
  }

  return (
    // POST for the same reason as the sign-in form: an unhydrated GET would
    // put the address in the URL.
    <form onSubmit={submit} method="post" className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Field label={isAr ? 'البريد الإلكتروني' : 'Email'} htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Mail />}
        {isAr ? 'ابعتلي الرابط' : 'Send me the link'}
      </Button>
    </form>
  );
}

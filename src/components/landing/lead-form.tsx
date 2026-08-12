'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { submitLead } from '@/app/[locale]/c/[username]/actions';

/**
 * The public contact form. Every submission becomes a `Lead` for the coach.
 *
 * The trainer is addressed by username, never by id: the id is not the
 * visitor's to know, and the action resolves it server-side against an
 * approved, published page.
 */
export function LeadForm({
  trainerUsername,
  pageId,
  preview,
  askGoal,
  isAr,
  buttonLabel,
  successMessage,
}: {
  trainerUsername: string;
  pageId: string | null;
  preview: boolean;
  askGoal: boolean;
  isAr: boolean;
  buttonLabel: string;
  successMessage: string;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  if (done) {
    return (
      <Alert variant="success">
        <CheckCircle2 />
        <AlertDescription>
          {successMessage || (isAr ? 'وصلتني رسالتك.' : 'Your message came through.')}
        </AlertDescription>
      </Alert>
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    startBusy(async () => {
      const result = await submitLead({
        username: trainerUsername,
        pageId,
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? ''),
        email: String(form.get('email') ?? ''),
        goal: String(form.get('goal') ?? ''),
        message: String(form.get('message') ?? ''),
      });
      if (result.ok) setDone(true);
      else setError(result.error ?? (isAr ? 'حصل خطأ، جرّب تاني' : 'Something went wrong'));
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isAr ? 'الاسم' : 'Name'} htmlFor="lead-name" required>
          <Input id="lead-name" name="name" required maxLength={120} autoComplete="name" />
        </Field>
        <Field label={isAr ? 'رقم الهاتف' : 'Phone'} htmlFor="lead-phone" required>
          <Input
            id="lead-phone"
            name="phone"
            required
            dir="ltr"
            inputMode="tel"
            maxLength={30}
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field label={isAr ? 'البريد (اختياري)' : 'Email (optional)'} htmlFor="lead-email">
        <Input id="lead-email" name="email" type="email" dir="ltr" maxLength={160} />
      </Field>

      {askGoal ? (
        <Field label={isAr ? 'هدفك' : 'Your goal'} htmlFor="lead-goal">
          <Input
            id="lead-goal"
            name="goal"
            maxLength={120}
            placeholder={isAr ? 'مثلًا: أنزل 10 كيلو' : 'e.g. lose 10 kg'}
          />
        </Field>
      ) : null}

      <Field label={isAr ? 'رسالتك' : 'Message'} htmlFor="lead-message">
        <Textarea id="lead-message" name="message" rows={3} maxLength={1000} />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={busy || preview}>
        <Send />
        {buttonLabel || (isAr ? 'ابعت' : 'Send')}
      </Button>

      {preview ? (
        <p className="text-center text-xs text-muted-foreground">
          {isAr ? 'النموذج معطّل في المعاينة' : 'The form is disabled in preview'}
        </p>
      ) : null}
    </form>
  );
}

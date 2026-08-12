'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChipSelect, ChipRadio } from '@/components/ui/chip-select';
import { StepperHeader, StepPanel } from '@/components/ui/stepper';
import { cn } from '@/lib/utils';
import { registerTrainer, checkUsername } from './actions';
import { validateStep, STEP_FIELDS, type RegisterInput } from './schema';

interface Props {
  locale: string;
  /** Prebuilt in the server component so labels stay in one place. */
  options: {
    specialties: { value: string; label: string }[];
    countries: { value: string; label: string; dial: string }[];
  };
  labels: Record<string, string>;
}

type Draft = Partial<RegisterInput>;

const STEP_COUNT = STEP_FIELDS.length;

export function RegisterWizard({ locale, options, labels }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [draft, setDraft] = useState<Draft>({ specialties: [], yearsExperience: undefined });
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * `?ref=CODE` on the signup link prefills the invite field.
   *
   * In an effect rather than a `useState` initializer: this component is
   * server-rendered first, where `window` does not exist, and React does not
   * re-run a state initializer during hydration — it keeps the server's value.
   * So an initializer guarded on `typeof window` would resolve to an empty
   * string on the server and stay empty forever, and every invite link would
   * silently fail to attribute its referral.
   *
   * Read from the URL rather than a cookie, so a link shared over WhatsApp
   * works in a browser that has never seen this site — which is the only way
   * a referral link is ever actually opened.
   */
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (!ref) return;
    setDraft((prev) => ({ ...prev, referralCode: ref.toUpperCase().slice(0, 16) }));
  }, []);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  // Username availability, checked as the field settles rather than on submit.
  const [usernameState, setUsernameState] = useState<
    { status: 'idle' | 'checking' | 'free' } | { status: 'taken'; suggestion?: string }
  >({ status: 'idle' });
  const usernameRequest = useRef(0);

  const set = <K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  const username = draft.username ?? '';

  useEffect(() => {
    if (step !== STEP_COUNT - 1 || username.length < 3) {
      setUsernameState({ status: 'idle' });
      return;
    }
    // Each keystroke invalidates the previous lookup, so a slow response for an
    // older value can never overwrite the answer for the current one.
    const request = ++usernameRequest.current;
    setUsernameState({ status: 'checking' });
    const timer = setTimeout(async () => {
      const result = await checkUsername(username);
      if (request !== usernameRequest.current) return;
      setUsernameState(
        result.available ? { status: 'free' } : { status: 'taken', suggestion: result.suggestion },
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [username, step]);

  function goNext() {
    const stepErrors = validateStep(step, draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  }

  function goBack() {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  function onSubmit() {
    const stepErrors = validateStep(step, draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setFormError(null);

    startSubmit(async () => {
      const result = await registerTrainer(draft as RegisterInput);
      if (!result.ok) {
        setFormError(result.error ?? labels.generic);
        // Send the user back to whichever step owns the rejected field.
        if (result.field) {
          const owner = STEP_FIELDS.findIndex((fields) =>
            (fields as readonly string[]).includes(result.field!),
          );
          if (owner >= 0 && owner !== step) {
            setDirection(owner > step ? 1 : -1);
            setStep(owner);
          }
          setErrors({ [result.field]: result.error ?? labels.generic });
        }
        return;
      }

      // Sign in immediately: the next step is uploading certificates, which
      // needs a session, and asking someone to log in right after signing up
      // is a needless place to lose them.
      const signInResult = await signIn('credentials', {
        email: draft.email,
        password: draft.password,
        redirect: false,
      });
      if (signInResult?.error) {
        router.push(`/${locale}/login`);
        return;
      }
      router.push(`/${locale}/onboarding/certificates`);
      router.refresh();
    });
  }

  const steps = [
    { key: 'account', label: labels.stepAccount },
    { key: 'expertise', label: labels.stepExpertise },
    { key: 'contact', label: labels.stepContact },
    { key: 'handle', label: labels.stepHandle },
  ];

  const dial = options.countries.find((c) => c.value === draft.country)?.dial;

  return (
    <div className="space-y-6">
      <StepperHeader steps={steps} current={step} />

      <Card>
        <CardContent className="space-y-5 p-6">
          {formError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <StepPanel stepKey={steps[step].key} direction={direction}>
            {step === 0 ? (
              <div className="space-y-4">
                <Field label={labels.fullName} htmlFor="fullName" required error={errors.fullName}>
                  <Input
                    id="fullName"
                    value={draft.fullName ?? ''}
                    onChange={(e) => set('fullName', e.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.fullName)}
                  />
                </Field>

                <Field label={labels.gender} required error={errors.gender}>
                  <ChipRadio
                    value={draft.gender ?? null}
                    onChange={(v) => set('gender', v as RegisterInput['gender'])}
                    options={[
                      { value: 'MALE', label: labels.male },
                      { value: 'FEMALE', label: labels.female },
                    ]}
                  />
                </Field>

                <Field label={labels.email} htmlFor="email" required error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    dir="ltr"
                    value={draft.email ?? ''}
                    onChange={(e) => set('email', e.target.value)}
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={labels.password}
                    htmlFor="password"
                    required
                    error={errors.password}
                    hint={labels.passwordHint}
                  >
                    <Input
                      id="password"
                      type="password"
                      value={draft.password ?? ''}
                      onChange={(e) => set('password', e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={Boolean(errors.password)}
                    />
                  </Field>
                  <Field
                    label={labels.confirmPassword}
                    htmlFor="confirmPassword"
                    required
                    error={errors.confirmPassword}
                  >
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={draft.confirmPassword ?? ''}
                      onChange={(e) => set('confirmPassword', e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={Boolean(errors.confirmPassword)}
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                <Field
                  label={labels.specialties}
                  required
                  error={errors.specialties}
                  hint={labels.specialtiesHint}
                >
                  <ChipSelect
                    options={options.specialties}
                    value={draft.specialties ?? []}
                    onChange={(v) => set('specialties', v as RegisterInput['specialties'])}
                    max={6}
                  />
                </Field>

                <Field
                  label={labels.yearsExperience}
                  htmlFor="yearsExperience"
                  required
                  error={errors.yearsExperience}
                >
                  <Input
                    id="yearsExperience"
                    type="number"
                    min={0}
                    max={60}
                    inputMode="numeric"
                    className="max-w-32"
                    value={draft.yearsExperience ?? ''}
                    onChange={(e) =>
                      set(
                        'yearsExperience',
                        e.target.value === '' ? (undefined as never) : Number(e.target.value),
                      )
                    }
                    aria-invalid={Boolean(errors.yearsExperience)}
                  />
                </Field>

                <Field label={labels.trainsGenders} required error={errors.trainsGenders}>
                  <ChipRadio
                    value={draft.trainsGenders ?? null}
                    onChange={(v) => set('trainsGenders', v as RegisterInput['trainsGenders'])}
                    options={[
                      { value: 'MALE', label: labels.trainsMen },
                      { value: 'FEMALE', label: labels.trainsWomen },
                      { value: 'BOTH', label: labels.trainsBoth },
                    ]}
                  />
                </Field>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <Field label={labels.country} htmlFor="country" required error={errors.country}>
                  <select
                    id="country"
                    value={draft.country ?? ''}
                    onChange={(e) => set('country', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-invalid={Boolean(errors.country)}
                  >
                    <option value="">{labels.selectCountry}</option>
                    {options.countries.map((country) => (
                      <option key={country.value} value={country.value}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label={labels.phone}
                  htmlFor="phone"
                  required
                  error={errors.phone}
                  hint={dial ? `${labels.phoneHint} ${dial}` : undefined}
                >
                  <Input
                    id="phone"
                    type="tel"
                    dir="ltr"
                    value={draft.phone ?? ''}
                    onChange={(e) => set('phone', e.target.value)}
                    autoComplete="tel"
                    placeholder={dial ? `${dial}…` : undefined}
                    aria-invalid={Boolean(errors.phone)}
                  />
                </Field>

                <Field label={labels.city} htmlFor="city" error={errors.city}>
                  <Input
                    id="city"
                    value={draft.city ?? ''}
                    onChange={(e) => set('city', e.target.value)}
                    autoComplete="address-level2"
                  />
                </Field>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <Field
                  label={labels.username}
                  htmlFor="username"
                  required
                  error={errors.username}
                  hint={labels.usernameHint}
                >
                  <div className="space-y-2">
                    <div
                      className={cn(
                        'flex items-center rounded-md border border-input bg-background shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
                        usernameState.status === 'taken' && 'border-destructive',
                        usernameState.status === 'free' && 'border-success',
                      )}
                      dir="ltr"
                    >
                      <span className="ps-3 text-sm text-muted-foreground">coachmate.app/c/</span>
                      <input
                        id="username"
                        value={username}
                        onChange={(e) => set('username', e.target.value.toLowerCase())}
                        // The wrapper carries the focus ring, so the inner
                        // field must not draw a second one inside it.
                        className="h-10 min-w-0 flex-1 bg-transparent pe-2 text-sm outline-none focus-visible:ring-0"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={Boolean(errors.username)}
                      />
                      <span className="pe-3">
                        {usernameState.status === 'checking' ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : usernameState.status === 'free' ? (
                          <Check className="size-4 text-success" />
                        ) : usernameState.status === 'taken' ? (
                          <X className="size-4 text-destructive" />
                        ) : null}
                      </span>
                    </div>

                    {usernameState.status === 'taken' ? (
                      <p className="text-xs text-destructive">
                        {labels.usernameTaken}
                        {usernameState.suggestion ? (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="font-medium text-primary underline-offset-2 hover:underline"
                              onClick={() => set('username', usernameState.suggestion!)}
                            >
                              {usernameState.suggestion}
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </Field>

                <Field label={labels.bio} htmlFor="bio" error={errors.bio} hint={labels.bioHint}>
                  <Textarea
                    id="bio"
                    rows={4}
                    value={draft.bio ?? ''}
                    onChange={(e) => set('bio', e.target.value)}
                    maxLength={1000}
                  />
                </Field>

                <Field
                  label={labels.referralCode}
                  htmlFor="referralCode"
                  error={errors.referralCode}
                  hint={labels.referralCodeHint}
                >
                  <Input
                    id="referralCode"
                    dir="ltr"
                    value={draft.referralCode ?? ''}
                    onChange={(e) => set('referralCode', e.target.value.toUpperCase())}
                    maxLength={16}
                  />
                </Field>

                <p className="rounded-md bg-accent/60 p-3 text-sm text-accent-foreground">
                  {labels.reviewNotice}
                </p>
              </div>
            ) : null}
          </StepPanel>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-5">
            {/* `rtl-flip` mirrors the glyph, so ArrowLeft always points
                backwards and ArrowRight forwards in both directions. */}
            <Button
              type="button"
              variant="ghost"
              onClick={goBack}
              disabled={step === 0 || submitting}
            >
              <ArrowLeft className="rtl-flip" />
              {labels.back}
            </Button>

            {step < STEP_COUNT - 1 ? (
              <Button type="button" onClick={goNext}>
                {labels.next}
                <ArrowRight className="rtl-flip" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={onSubmit}
                loading={submitting}
                disabled={usernameState.status === 'taken' || usernameState.status === 'checking'}
              >
                {labels.submit}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

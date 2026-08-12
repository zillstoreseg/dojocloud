'use client';

import { useState, useTransition } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowLeft, CheckCircle2, Upload, Clock, Copy, Check } from 'lucide-react';
import { StepperHeader } from '@/components/ui/stepper';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ChipSelect, ChipRadio } from '@/components/ui/chip-select';
import { formatMoney, formatNumber } from '@/lib/money';
import { transition } from '@/lib/motion';
import { cn, initials } from '@/lib/utils';
import { submitJoin, attachReceipt } from './actions';
import {
  EMPTY_INTAKE,
  validateIntakeStep,
  GOALS,
  ACTIVITY_LEVELS,
  SPORT_LEVELS,
  TRAINING_PLACES,
  DIET_PREFERENCES,
  EQUIPMENT,
  type IntakeInput,
} from './schema';
import { LABELS } from './labels';

export interface JoinPackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  sessionsCount: number | null;
}

interface PaymentInfo {
  instructions: string;
  bankName: string;
  bankAccount: string;
  instapay: string;
  vodafoneCash: string;
}

/**
 * Package → intake → review → receipt, in one wizard.
 *
 * Seven steps is a lot to ask of a stranger, so the shape of the ask matters:
 * one idea per screen, the questionnaire validated a step at a time so nobody
 * reaches the end and is sent back, and a review screen that shows the coach
 * what they will be working with before any money is mentioned.
 */
export function JoinWizard({
  locale,
  coach,
  packages,
  preselectedPackageId,
  payment,
}: {
  locale: string;
  coach: { username: string; fullName: string; avatarUrl: string | null };
  packages: JoinPackage[];
  preselectedPackageId: string | null;
  payment: PaymentInfo;
}) {
  const isAr = locale === 'ar';
  const L = LABELS[isAr ? 'ar' : 'en'];
  const reduced = useReducedMotion();

  const [step, setStep] = useState(preselectedPackageId ? 1 : 0);
  const [packageId, setPackageId] = useState(preselectedPackageId);
  const [values, setValues] = useState<IntakeInput>(EMPTY_INTAKE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const set = <K extends keyof IntakeInput>(key: K, value: IntakeInput[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const selected = packages.find((p) => p.id === packageId) ?? null;

  const steps = [
    { key: 'package', label: L.stepPackage },
    { key: 'you', label: L.stepYou },
    { key: 'body', label: L.stepBody },
    { key: 'training', label: L.stepTraining },
    { key: 'health', label: L.stepHealth },
    { key: 'life', label: L.stepLife },
    { key: 'review', label: L.stepReview },
    { key: 'pay', label: L.stepPay },
  ];

  function next() {
    setFormError(null);
    if (step === 0) {
      if (!packageId) return setFormError(L.pickPackage);
      return setStep(1);
    }
    // Steps 1..5 map onto intake steps 0..4.
    if (step >= 1 && step <= 5) {
      const found = validateIntakeStep(step - 1, values);
      if (Object.keys(found).length) return setErrors(found);
      return setStep(step + 1);
    }
    if (step === 6) return submit();
  }

  function submit() {
    setFormError(null);
    startBusy(async () => {
      const result = await submitJoin({
        username: coach.username,
        packageId: packageId!,
        intake: values,
      });
      if (!result.ok || !result.subscriptionId) {
        setFormError(result.error ?? L.generic);
        return;
      }
      setSubscriptionId(result.subscriptionId);
      setStep(7);
    });
  }

  function upload() {
    if (!receiptFile || !subscriptionId) return setFormError(L.pickReceipt);
    setFormError(null);
    startBusy(async () => {
      const form = new FormData();
      form.set('receipt', receiptFile);
      const result = await attachReceipt({ subscriptionId, file: form });
      if (!result.ok) setFormError(result.error ?? L.generic);
      else setStep(8);
    });
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(value);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  const chip = <T extends string>(list: readonly T[], map: Record<string, string>) =>
    list.map((value) => ({ value, label: map[value] ?? value }));

  return (
    <div className="space-y-6">
      {/* Who you are joining */}
      <div className="flex items-center justify-center gap-3">
        {coach.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coach.avatarUrl} alt="" className="squircle size-12 object-cover" />
        ) : (
          <span className="squircle flex size-12 items-center justify-center bg-primary/10 font-display font-semibold text-primary">
            {initials(coach.fullName)}
          </span>
        )}
        <div>
          <p className="text-xs text-muted-foreground">{L.joining}</p>
          <p className="font-display font-semibold">{coach.fullName}</p>
        </div>
      </div>

      {step < 8 ? (
        <StepperHeader steps={steps} current={Math.min(step, 7)} />
      ) : null}

      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={transition.element}
        >
          <Card>
            <CardContent className="space-y-5 p-6">
              {/* 0 — package */}
              {step === 0 ? (
                <>
                  <Header title={L.stepPackage} hint={L.packageHint} />
                  <div className="grid gap-3">
                    {packages.map((pkg) => (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setPackageId(pkg.id)}
                        className={cn(
                          'rounded-lg border p-4 text-start transition-colors',
                          packageId === pkg.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border/60 hover:bg-accent/50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display font-semibold">{pkg.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {L.days.replace('{n}', formatNumber(pkg.durationDays, locale))}
                              {pkg.sessionsCount
                                ? ` · ${L.sessions.replace('{n}', formatNumber(pkg.sessionsCount, locale))}`
                                : ''}
                            </p>
                            {pkg.description ? (
                              <p className="mt-2 text-sm text-muted-foreground">{pkg.description}</p>
                            ) : null}
                          </div>
                          <p className="shrink-0 font-display text-lg font-bold tabular-nums text-primary">
                            {formatMoney(pkg.price, pkg.currency, locale)}
                          </p>
                        </div>
                      </button>
                    ))}
                    {packages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{L.noPackages}</p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {/* 1 — you */}
              {step === 1 ? (
                <>
                  <Header title={L.stepYou} hint={L.youHint} />
                  <Field label={L.fullName} htmlFor="j-name" required error={errors.fullName}>
                    <Input
                      id="j-name"
                      value={values.fullName}
                      onChange={(e) => set('fullName', e.target.value)}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={L.phone} htmlFor="j-phone" required error={errors.phone}>
                      <Input
                        id="j-phone"
                        dir="ltr"
                        inputMode="tel"
                        value={values.phone}
                        onChange={(e) => set('phone', e.target.value)}
                      />
                    </Field>
                    <Field label={L.email} htmlFor="j-email" error={errors.email}>
                      <Input
                        id="j-email"
                        dir="ltr"
                        type="email"
                        value={values.email ?? ''}
                        onChange={(e) => set('email', e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field
                    label={L.password}
                    htmlFor="j-pass"
                    hint={L.passwordHint}
                    error={errors.password}
                  >
                    <Input
                      id="j-pass"
                      dir="ltr"
                      type="password"
                      autoComplete="new-password"
                      value={values.password ?? ''}
                      onChange={(e) => set('password', e.target.value)}
                    />
                  </Field>
                  <Field label={L.gender} required error={errors.gender}>
                    <ChipRadio
                      value={values.gender}
                      onChange={(v) => set('gender', v as IntakeInput['gender'])}
                      options={chip(['MALE', 'FEMALE'] as const, L.genderMap)}
                    />
                  </Field>
                  <Field label={L.birthDate} htmlFor="j-dob" required error={errors.birthDate}>
                    <Input
                      id="j-dob"
                      type="date"
                      dir="ltr"
                      value={values.birthDate}
                      onChange={(e) => set('birthDate', e.target.value)}
                    />
                  </Field>
                </>
              ) : null}

              {/* 2 — body & goal */}
              {step === 2 ? (
                <>
                  <Header title={L.stepBody} hint={L.bodyHint} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={L.heightCm} htmlFor="j-h" required error={errors.heightCm}>
                      <Input
                        id="j-h"
                        type="number"
                        inputMode="numeric"
                        value={values.heightCm}
                        onChange={(e) => set('heightCm', Number(e.target.value))}
                      />
                    </Field>
                    <Field label={L.weightKg} htmlFor="j-w" required error={errors.weightKg}>
                      <Input
                        id="j-w"
                        type="number"
                        inputMode="decimal"
                        value={values.weightKg}
                        onChange={(e) => set('weightKg', Number(e.target.value))}
                      />
                    </Field>
                  </div>
                  <Field label={L.goal} required error={errors.goal}>
                    <ChipRadio
                      value={values.goal}
                      onChange={(v) => set('goal', v as IntakeInput['goal'])}
                      options={chip(GOALS, L.goalMap)}
                    />
                  </Field>
                  <Field label={L.targetWeight} htmlFor="j-tw" hint={L.targetWeightHint}>
                    <Input
                      id="j-tw"
                      type="number"
                      inputMode="decimal"
                      value={values.targetWeightKg ?? ''}
                      onChange={(e) =>
                        set('targetWeightKg', e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </Field>
                </>
              ) : null}

              {/* 3 — training */}
              {step === 3 ? (
                <>
                  <Header title={L.stepTraining} hint={L.trainingHint} />
                  <Field label={L.activityLevel} required error={errors.activityLevel}>
                    <ChipRadio
                      value={values.activityLevel}
                      onChange={(v) => set('activityLevel', v as IntakeInput['activityLevel'])}
                      options={chip(ACTIVITY_LEVELS, L.activityMap)}
                    />
                  </Field>

                  <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                    <span>
                      <span className="font-medium">{L.isAthlete}</span>
                      <span className="block text-xs text-muted-foreground">{L.isAthleteHint}</span>
                    </span>
                    <Switch
                      checked={values.isAthlete ?? false}
                      onCheckedChange={(v) => set('isAthlete', v)}
                    />
                  </label>

                  {values.isAthlete ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={L.sportType} htmlFor="j-sport">
                        <Input
                          id="j-sport"
                          value={values.sportType ?? ''}
                          onChange={(e) => set('sportType', e.target.value)}
                        />
                      </Field>
                      <Field label={L.sportLevel}>
                        <ChipRadio
                          value={values.sportLevel ?? null}
                          onChange={(v) => set('sportLevel', v as IntakeInput['sportLevel'])}
                          options={chip(SPORT_LEVELS, L.sportLevelMap)}
                        />
                      </Field>
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={L.daysPerWeek} htmlFor="j-days" required error={errors.trainingDaysPerWeek}>
                      <Input
                        id="j-days"
                        type="number"
                        min={1}
                        max={7}
                        value={values.trainingDaysPerWeek}
                        onChange={(e) => set('trainingDaysPerWeek', Number(e.target.value))}
                      />
                    </Field>
                    <Field label={L.sessionMinutes} htmlFor="j-min" required error={errors.sessionMinutes}>
                      <Input
                        id="j-min"
                        type="number"
                        min={15}
                        max={240}
                        step={5}
                        value={values.sessionMinutes}
                        onChange={(e) => set('sessionMinutes', Number(e.target.value))}
                      />
                    </Field>
                    <Field label={L.experienceYears} htmlFor="j-exp">
                      <Input
                        id="j-exp"
                        type="number"
                        min={0}
                        max={60}
                        value={values.previousExperienceYears ?? 0}
                        onChange={(e) => set('previousExperienceYears', Number(e.target.value))}
                      />
                    </Field>
                  </div>

                  <Field label={L.trainingPlace} required error={errors.trainingPlace}>
                    <ChipRadio
                      value={values.trainingPlace}
                      onChange={(v) => set('trainingPlace', v as IntakeInput['trainingPlace'])}
                      options={chip(TRAINING_PLACES, L.placeMap)}
                    />
                  </Field>

                  <Field label={L.equipment} hint={L.equipmentHint}>
                    <ChipSelect
                      value={values.equipment ?? []}
                      onChange={(v) => set('equipment', v as IntakeInput['equipment'])}
                      options={chip(EQUIPMENT, L.equipmentMap)}
                    />
                  </Field>
                </>
              ) : null}

              {/* 4 — health */}
              {step === 4 ? (
                <>
                  <Header title={L.stepHealth} hint={L.healthHint} />
                  <TagField
                    label={L.injuries}
                    hint={L.tagHint}
                    values={values.injuries ?? []}
                    onChange={(v) => set('injuries', v)}
                    placeholder={L.injuriesPlaceholder}
                  />
                  <TagField
                    label={L.conditions}
                    hint={L.tagHint}
                    values={values.medicalConditions ?? []}
                    onChange={(v) => set('medicalConditions', v)}
                    placeholder={L.conditionsPlaceholder}
                  />
                  <TagField
                    label={L.allergies}
                    hint={L.tagHint}
                    values={values.allergies ?? []}
                    onChange={(v) => set('allergies', v)}
                    placeholder={L.allergiesPlaceholder}
                  />
                  <Field label={L.medications} htmlFor="j-meds">
                    <Textarea
                      id="j-meds"
                      rows={2}
                      value={values.medications ?? ''}
                      onChange={(e) => set('medications', e.target.value)}
                    />
                  </Field>
                </>
              ) : null}

              {/* 5 — food & lifestyle */}
              {step === 5 ? (
                <>
                  <Header title={L.stepLife} hint={L.lifeHint} />
                  <Field label={L.dietPreference}>
                    <ChipRadio
                      value={values.dietPreference ?? 'NONE'}
                      onChange={(v) => set('dietPreference', v as IntakeInput['dietPreference'])}
                      options={chip(DIET_PREFERENCES, L.dietMap)}
                    />
                  </Field>
                  <TagField
                    label={L.dislikedFoods}
                    hint={L.tagHint}
                    values={values.dislikedFoods ?? []}
                    onChange={(v) => set('dislikedFoods', v)}
                    placeholder={L.dislikedPlaceholder}
                  />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={L.mealsPerDay} htmlFor="j-meals" required error={errors.mealsPerDay}>
                      <Input
                        id="j-meals"
                        type="number"
                        min={1}
                        max={8}
                        value={values.mealsPerDay}
                        onChange={(e) => set('mealsPerDay', Number(e.target.value))}
                      />
                    </Field>
                    <Field label={L.sleepHours} htmlFor="j-sleep" required error={errors.sleepHours}>
                      <Input
                        id="j-sleep"
                        type="number"
                        min={3}
                        max={14}
                        value={values.sleepHours}
                        onChange={(e) => set('sleepHours', Number(e.target.value))}
                      />
                    </Field>
                    <Field label={L.waterLiters} htmlFor="j-water">
                      <Input
                        id="j-water"
                        type="number"
                        step={0.5}
                        min={0}
                        max={10}
                        value={values.waterLiters ?? ''}
                        onChange={(e) =>
                          set('waterLiters', e.target.value ? Number(e.target.value) : null)
                        }
                      />
                    </Field>
                  </div>
                  <Field label={L.stressLevel} hint={L.stressHint} error={errors.stressLevel}>
                    <ChipRadio
                      value={String(values.stressLevel)}
                      onChange={(v) => set('stressLevel', Number(v))}
                      options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                    />
                  </Field>
                  <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                    <span className="font-medium">{L.smokes}</span>
                    <Switch
                      checked={values.smokes ?? false}
                      onCheckedChange={(v) => set('smokes', v)}
                    />
                  </label>
                  <Field label={L.workSchedule} htmlFor="j-work" hint={L.workHint}>
                    <Input
                      id="j-work"
                      value={values.workSchedule ?? ''}
                      onChange={(e) => set('workSchedule', e.target.value)}
                    />
                  </Field>
                  <Field label={L.notes} htmlFor="j-notes">
                    <Textarea
                      id="j-notes"
                      rows={3}
                      value={values.notes ?? ''}
                      onChange={(e) => set('notes', e.target.value)}
                    />
                  </Field>
                </>
              ) : null}

              {/* 6 — review */}
              {step === 6 && selected ? (
                <>
                  <Header title={L.stepReview} hint={L.reviewHint} />
                  <div className="rounded-lg border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display font-semibold">{selected.name}</p>
                      <p className="font-display text-lg font-bold tabular-nums text-primary">
                        {formatMoney(selected.price, selected.currency, locale)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {L.days.replace('{n}', formatNumber(selected.durationDays, locale))}
                    </p>
                  </div>

                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Row label={L.fullName} value={values.fullName} />
                    <Row label={L.phone} value={values.phone} ltr />
                    <Row label={L.goal} value={L.goalMap[values.goal]} />
                    <Row
                      label={L.weightKg}
                      value={`${formatNumber(values.weightKg, locale)} kg`}
                    />
                    <Row
                      label={L.heightCm}
                      value={`${formatNumber(values.heightCm, locale)} cm`}
                    />
                    <Row label={L.activityLevel} value={L.activityMap[values.activityLevel]} />
                    <Row
                      label={L.daysPerWeek}
                      value={formatNumber(values.trainingDaysPerWeek, locale)}
                    />
                    <Row label={L.trainingPlace} value={L.placeMap[values.trainingPlace]} />
                  </dl>

                  <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                    {L.reviewNote}
                  </p>
                </>
              ) : null}

              {/* 7 — receipt */}
              {step === 7 && selected ? (
                <>
                  <Header title={L.stepPay} hint={L.payHint} />

                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
                    <p className="text-sm text-muted-foreground">{L.amountDue}</p>
                    <p className="font-display text-3xl font-bold tabular-nums text-primary">
                      {formatMoney(selected.price, selected.currency, locale)}
                    </p>
                  </div>

                  {payment.instructions ? (
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {payment.instructions}
                    </p>
                  ) : null}

                  <div className="space-y-2">
                    {[
                      [L.instapay, payment.instapay],
                      [L.vodafoneCash, payment.vodafoneCash],
                      [payment.bankName || L.bank, payment.bankAccount],
                    ]
                      .filter(([, value]) => Boolean(value))
                      .map(([label, value]) => (
                        <div
                          key={label}
                          className="flex items-center gap-2 rounded-md border border-border/60 p-2"
                        >
                          <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
                          <code className="min-w-0 flex-1 truncate text-sm" dir="ltr">
                            {value}
                          </code>
                          <Button variant="ghost" size="sm" onClick={() => copy(value!)}>
                            {copied === value ? <Check className="text-primary" /> : <Copy />}
                          </Button>
                        </div>
                      ))}
                  </div>

                  <Field label={L.receipt} htmlFor="j-receipt" required>
                    <Input
                      id="j-receipt"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    />
                  </Field>

                  <Button className="w-full" size="lg" disabled={busy || !receiptFile} onClick={upload}>
                    <Upload />
                    {L.sendReceipt}
                  </Button>
                </>
              ) : null}

              {/* 8 — done */}
              {step === 8 ? (
                <div className="space-y-4 py-4 text-center">
                  <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle2 className="size-8 text-primary" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold">{L.doneTitle}</h2>
                  <p className="mx-auto max-w-md text-muted-foreground">{L.doneBody}</p>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-4" />
                    {L.doneWait}
                  </div>
                </div>
              ) : null}

              {/* Footer nav */}
              {step < 7 ? (
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    variant="ghost"
                    disabled={step === 0 || busy}
                    onClick={() => {
                      setErrors({});
                      setFormError(null);
                      setStep(step - 1);
                    }}
                  >
                    <ArrowLeft className="rtl-flip" />
                    {L.back}
                  </Button>
                  <Button onClick={next} disabled={busy}>
                    {step === 6 ? L.confirm : L.next}
                    <ArrowRight className="rtl-flip" />
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Header({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-1">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Free-text list input. Injuries and allergies cannot be a fixed list — the
 * useful answer is usually the one that is not on it — but a comma-separated
 * blob is unreadable back to the coach, so each entry becomes a chip.
 */
function TagField({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const value = draft.trim();
    if (!value || values.includes(value) || values.length >= 10) return setDraft('');
    onChange([...values, value]);
    setDraft('');
  }

  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
        {values.length ? (
          <div className="flex flex-wrap gap-1.5">
            {values.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="rounded-full bg-muted px-3 py-1 text-xs transition-colors hover:bg-destructive/10"
              >
                {value} ✕
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChipRadio } from '@/components/ui/chip-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createTrainee, updateTrainee, type TraineeInput } from './actions';

export interface TraineeFormValues extends TraineeInput {
  id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: TraineeFormValues;
  options: {
    goals: { value: string; label: string }[];
    activity: { value: string; label: string }[];
  };
  labels: Record<string, string>;
}

const EMPTY: TraineeFormValues = {
  fullName: '',
  phone: '',
  email: '',
  gender: null,
  birthDate: '',
  heightCm: null,
  startWeightKg: null,
  goal: null,
  activityLevel: null,
  medicalNotes: '',
  injuries: '',
  notes: '',
  renewalDate: '',
};

export function TraineeForm({ open, onOpenChange, initial, options, labels }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<TraineeFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [saving, startSave] = useTransition();

  const set = <K extends keyof TraineeFormValues>(key: K, value: TraineeFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // A number input yields '' when cleared; null keeps the column nullable.
  const numeric = (raw: string): number | null => (raw === '' ? null : Number(raw));

  function onSubmit() {
    setError(null);
    setUpgrade(false);

    startSave(async () => {
      const result = initial?.id
        ? await updateTrainee({ ...values, id: initial.id })
        : await createTrainee(values);

      if (!result.ok) {
        setError(result.error ?? labels.generic);
        setUpgrade(Boolean(result.upgrade));
        return;
      }
      onOpenChange(false);
      setValues(EMPTY);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? labels.editTitle : labels.addTitle}</DialogTitle>
          <DialogDescription>{labels.subtitle}</DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant={upgrade ? 'warning' : 'destructive'}>
            {upgrade ? <Sparkles /> : <AlertCircle />}
            <div className="flex-1">
              <AlertDescription>{error}</AlertDescription>
            </div>
            {upgrade ? (
              <Button size="sm" asChild>
                <Link href="/dash/billing">{labels.upgrade}</Link>
              </Button>
            ) : null}
          </Alert>
        ) : null}

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={labels.fullName} htmlFor="t-name" required>
              <Input
                id="t-name"
                value={values.fullName}
                onChange={(e) => set('fullName', e.target.value)}
              />
            </Field>
            <Field label={labels.gender}>
              <ChipRadio
                value={values.gender ?? null}
                onChange={(v) => set('gender', v as TraineeFormValues['gender'])}
                options={[
                  { value: 'MALE', label: labels.male },
                  { value: 'FEMALE', label: labels.female },
                ]}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={labels.phone} htmlFor="t-phone">
              <Input
                id="t-phone"
                dir="ltr"
                value={values.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
              />
            </Field>
            <Field label={labels.email} htmlFor="t-email" hint={labels.emailHint}>
              <Input
                id="t-email"
                type="email"
                dir="ltr"
                value={values.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={labels.birthDate} htmlFor="t-dob">
              <Input
                id="t-dob"
                type="date"
                value={values.birthDate ?? ''}
                onChange={(e) => set('birthDate', e.target.value)}
              />
            </Field>
            <Field label={labels.height} htmlFor="t-height">
              <Input
                id="t-height"
                type="number"
                inputMode="decimal"
                step="0.5"
                value={values.heightCm ?? ''}
                onChange={(e) => set('heightCm', numeric(e.target.value))}
              />
            </Field>
            <Field label={labels.weight} htmlFor="t-weight">
              <Input
                id="t-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={values.startWeightKg ?? ''}
                onChange={(e) => set('startWeightKg', numeric(e.target.value))}
              />
            </Field>
          </div>

          <Field label={labels.goal} hint={labels.goalHint}>
            <ChipRadio
              value={values.goal ?? null}
              onChange={(v) => set('goal', v as TraineeFormValues['goal'])}
              options={options.goals}
            />
          </Field>

          <Field label={labels.activity}>
            <ChipRadio
              value={values.activityLevel ?? null}
              onChange={(v) => set('activityLevel', v as TraineeFormValues['activityLevel'])}
              options={options.activity}
            />
          </Field>

          <Field label={labels.renewalDate} htmlFor="t-renewal" hint={labels.renewalHint}>
            <Input
              id="t-renewal"
              type="date"
              className="max-w-48"
              value={values.renewalDate ?? ''}
              onChange={(e) => set('renewalDate', e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={labels.injuries} htmlFor="t-injuries">
              <Textarea
                id="t-injuries"
                rows={2}
                value={values.injuries ?? ''}
                onChange={(e) => set('injuries', e.target.value)}
              />
            </Field>
            <Field label={labels.medical} htmlFor="t-medical">
              <Textarea
                id="t-medical"
                rows={2}
                value={values.medicalNotes ?? ''}
                onChange={(e) => set('medicalNotes', e.target.value)}
              />
            </Field>
          </div>

          <Field label={labels.notes} htmlFor="t-notes">
            <Textarea
              id="t-notes"
              rows={2}
              value={values.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {labels.cancel}
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

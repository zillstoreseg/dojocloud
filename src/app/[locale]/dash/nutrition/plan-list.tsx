'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Apple, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { ChipRadio } from '@/components/ui/chip-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RevealGroup, RevealItem } from '@/components/motion/reveal';
import { createNutritionPlan, deleteNutritionPlan, type PlanInput } from './actions';

export interface PlanCard {
  id: string;
  name: string;
  isTemplate: boolean;
  traineeName: string | null;
  targetKcal: number | null;
  mealCount: number;
}

export interface TraineeOption {
  value: string;
  label: string;
  /** Pre-computed calorie target, so picking a trainee fills the field. */
  calorieTarget: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

interface Props {
  rows: PlanCard[];
  trainees: TraineeOption[];
  labels: Record<string, string>;
}

const EMPTY: PlanInput = {
  name: '',
  description: '',
  traineeId: null,
  isTemplate: false,
  targetKcal: null,
  targetProtein: null,
  targetCarbs: null,
  targetFat: null,
};

export function PlanList({ rows, trainees, labels }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PlanInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [busy, startBusy] = useTransition();

  const set = <K extends keyof PlanInput>(key: K, value: PlanInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  /**
   * Selecting a trainee pre-fills the targets from their computed needs —
   * that calculation already exists, and retyping it by hand is where the
   * numbers start disagreeing with the trainee's profile.
   */
  function pickTrainee(id: string) {
    const trainee = trainees.find((t) => t.value === id);
    setValues((prev) => ({
      ...prev,
      traineeId: id,
      targetKcal: trainee?.calorieTarget ?? prev.targetKcal,
      targetProtein: trainee?.protein ?? prev.targetProtein,
      targetCarbs: trainee?.carbs ?? prev.targetCarbs,
      targetFat: trainee?.fat ?? prev.targetFat,
      name: prev.name || (trainee ? labels.defaultName.replace('{name}', trainee.label) : ''),
    }));
  }

  function create() {
    setError(null);
    setUpgrade(false);
    startBusy(async () => {
      const result = await createNutritionPlan(values);
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        setUpgrade(Boolean(result.upgrade));
        return;
      }
      setOpen(false);
      router.push(`/dash/nutrition/${result.planId}`);
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(labels.confirmDelete.replace('{name}', name))) return;
    startBusy(async () => {
      await deleteNutritionPlan({ id });
      router.refresh();
    });
  }

  const numeric = (raw: string) => (raw === '' ? null : Number(raw));

  return (
    <div className="space-y-5">
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

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setValues(EMPTY);
            setOpen(true);
          }}
        >
          <Plus />
          {labels.add}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Apple />}
          title={labels.emptyTitle}
          description={labels.emptyDescription}
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              {labels.add}
            </Button>
          }
        />
      ) : (
        <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <RevealItem key={row.id}>
              <Card className="h-full transition-all duration-element ease-brand hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <Link href={`/dash/nutrition/${row.id}`} className="space-y-2">
                    <p className="font-medium hover:underline">{row.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {row.isTemplate ? (
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {labels.template}
                        </Badge>
                      ) : row.traineeName ? (
                        <Badge variant="muted" className="text-[11px] font-normal">
                          {row.traineeName}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.targetKcal ? `${row.targetKcal} ${labels.kcal} · ` : ''}
                      {labels.meals.replace('{n}', String(row.mealCount))}
                    </p>
                  </Link>

                  <div className="mt-auto flex justify-end pt-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={labels.delete}
                      onClick={() => remove(row.id, row.name)}
                      disabled={busy}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{labels.addTitle}</DialogTitle>
            <DialogDescription>{labels.formSubtitle}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-4 text-sm">
              <span>
                <span className="font-medium">{labels.isTemplate}</span>
                <span className="block text-xs text-muted-foreground">{labels.isTemplateHint}</span>
              </span>
              <Switch
                checked={values.isTemplate}
                onCheckedChange={(checked) => set('isTemplate', checked)}
              />
            </label>

            {!values.isTemplate && trainees.length > 0 ? (
              <Field label={labels.trainee} hint={labels.traineeHint}>
                <ChipRadio
                  value={values.traineeId ?? null}
                  onChange={pickTrainee}
                  options={trainees.map((t) => ({ value: t.value, label: t.label }))}
                />
              </Field>
            ) : null}

            <Field label={labels.name} htmlFor="np-name" required>
              <Input id="np-name" value={values.name} onChange={(e) => set('name', e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label={labels.kcalTarget} htmlFor="np-kcal">
                <Input
                  id="np-kcal"
                  type="number"
                  min={0}
                  value={values.targetKcal ?? ''}
                  onChange={(e) => set('targetKcal', numeric(e.target.value))}
                />
              </Field>
              <Field label={labels.protein} htmlFor="np-p">
                <Input
                  id="np-p"
                  type="number"
                  min={0}
                  value={values.targetProtein ?? ''}
                  onChange={(e) => set('targetProtein', numeric(e.target.value))}
                />
              </Field>
              <Field label={labels.carbs} htmlFor="np-c">
                <Input
                  id="np-c"
                  type="number"
                  min={0}
                  value={values.targetCarbs ?? ''}
                  onChange={(e) => set('targetCarbs', numeric(e.target.value))}
                />
              </Field>
              <Field label={labels.fat} htmlFor="np-f">
                <Input
                  id="np-f"
                  type="number"
                  min={0}
                  value={values.targetFat ?? ''}
                  onChange={(e) => set('targetFat', numeric(e.target.value))}
                />
              </Field>
            </div>

            <Field label={labels.description} htmlFor="np-desc">
              <Textarea
                id="np-desc"
                rows={2}
                value={values.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {labels.cancel}
            </Button>
            <Button onClick={create} loading={busy}>
              {labels.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

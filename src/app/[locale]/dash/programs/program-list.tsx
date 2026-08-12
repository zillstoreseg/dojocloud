'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, ClipboardList, Copy, Plus, Trash2 } from 'lucide-react';
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
import { createProgram, deleteProgram, duplicateProgram, type ProgramInput } from './actions';

export interface ProgramCard {
  id: string;
  name: string;
  goalLabel: string;
  weeksCount: number;
  exerciseCount: number;
  isTemplate: boolean;
  traineeName: string | null;
}

interface Props {
  rows: ProgramCard[];
  goals: { value: string; label: string }[];
  trainees: { value: string; label: string }[];
  labels: Record<string, string>;
}

export function ProgramList({ rows, goals, trainees, labels }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProgramInput>({
    name: '',
    description: '',
    goal: null,
    weeksCount: 4,
    traineeId: null,
    isTemplate: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const set = <K extends keyof ProgramInput>(key: K, value: ProgramInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function create() {
    setError(null);
    startBusy(async () => {
      const result = await createProgram(values);
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        return;
      }
      setOpen(false);
      // Straight into the builder: a program with an empty skeleton is not
      // finished, and the next thing to do is fill it.
      router.push(`/dash/programs/${result.programId}`);
    });
  }

  function duplicate(id: string) {
    startBusy(async () => {
      const result = await duplicateProgram({ id });
      if (result.ok) router.push(`/dash/programs/${result.programId}`);
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(labels.confirmDelete.replace('{name}', name))) return;
    startBusy(async () => {
      await deleteProgram({ id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {labels.add}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
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
                  <Link href={`/dash/programs/${row.id}`} className="space-y-2">
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
                      ) : (
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {labels.unassigned}
                        </Badge>
                      )}
                      {row.goalLabel !== '—' ? (
                        <Badge variant="muted" className="text-[11px] font-normal">
                          {row.goalLabel}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {labels.weeks.replace('{n}', String(row.weeksCount))} ·{' '}
                      {labels.exercises.replace('{n}', String(row.exerciseCount))}
                    </p>
                  </Link>

                  <div className="mt-auto flex items-center gap-1 pt-2">
                    <Button variant="ghost" size="sm" onClick={() => duplicate(row.id)} disabled={busy}>
                      <Copy />
                      {labels.duplicate}
                    </Button>
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
            <Field label={labels.name} htmlFor="pg-name" required>
              <Input id="pg-name" value={values.name} onChange={(e) => set('name', e.target.value)} />
            </Field>

            <Field label={labels.goal}>
              <ChipRadio
                value={values.goal ?? null}
                onChange={(v) => set('goal', v as ProgramInput['goal'])}
                options={goals}
              />
            </Field>

            <Field label={labels.weeksCount} htmlFor="pg-weeks" required hint={labels.weeksHint}>
              <Input
                id="pg-weeks"
                type="number"
                min={1}
                max={52}
                className="max-w-24"
                value={values.weeksCount}
                onChange={(e) => set('weeksCount', Number(e.target.value))}
              />
            </Field>

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
                  onChange={(v) => set('traineeId', v)}
                  options={trainees}
                />
              </Field>
            ) : null}

            <Field label={labels.description} htmlFor="pg-desc">
              <Textarea
                id="pg-desc"
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

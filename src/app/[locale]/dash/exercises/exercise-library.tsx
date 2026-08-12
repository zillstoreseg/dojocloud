'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Copy, Dumbbell, Pencil, Plus, Sparkles, Trash2, Video } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  createExercise,
  updateExercise,
  deleteExercise,
  copyFromLibrary,
  type ExerciseInput,
} from './actions';

export interface ExerciseCard extends ExerciseInput {
  id: string;
  /** null trainerId means it came from the admin-curated shared library. */
  isMine: boolean;
  muscleLabel: string;
  equipmentLabel: string;
  difficultyLabel: string;
  name: string;
}

interface Props {
  mine: ExerciseCard[];
  shared: ExerciseCard[];
  options: {
    muscles: { value: string; label: string }[];
    equipment: { value: string; label: string }[];
    difficulty: { value: string; label: string }[];
  };
  labels: Record<string, string>;
}

const EMPTY: ExerciseInput = {
  nameAr: '',
  nameEn: '',
  muscleGroup: 'CHEST',
  equipment: 'BODYWEIGHT',
  difficulty: 'BEGINNER',
  videoUrl: '',
  instructionsAr: '',
  instructionsEn: '',
};

export function ExerciseLibrary({ mine, shared, options, labels }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'mine' | 'shared'>(mine.length > 0 ? 'mine' : 'shared');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<ExerciseInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [busy, startBusy] = useTransition();

  const set = <K extends keyof ExerciseInput>(key: K, value: ExerciseInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function openAdd() {
    setEditingId(null);
    setValues(EMPTY);
    setError(null);
    setUpgrade(false);
    setFormOpen(true);
  }

  function openEdit(card: ExerciseCard) {
    setEditingId(card.id);
    setValues({
      nameAr: card.nameAr,
      nameEn: card.nameEn,
      muscleGroup: card.muscleGroup,
      equipment: card.equipment,
      difficulty: card.difficulty,
      videoUrl: card.videoUrl ?? '',
      instructionsAr: card.instructionsAr ?? '',
      instructionsEn: card.instructionsEn ?? '',
    });
    setError(null);
    setUpgrade(false);
    setFormOpen(true);
  }

  function save() {
    setError(null);
    setUpgrade(false);
    startBusy(async () => {
      const result = editingId
        ? await updateExercise({ ...values, id: editingId })
        : await createExercise(values);
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        setUpgrade(Boolean(result.upgrade));
        return;
      }
      setFormOpen(false);
      router.refresh();
    });
  }

  function copy(id: string) {
    startBusy(async () => {
      const result = await copyFromLibrary({ id });
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        setUpgrade(Boolean(result.upgrade));
        return;
      }
      setTab('mine');
      router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(labels.confirmDelete.replace('{name}', name))) return;
    startBusy(async () => {
      await deleteExercise({ id });
      router.refresh();
    });
  }

  const list = tab === 'mine' ? mine : shared;

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipRadio
          value={tab}
          onChange={(v) => setTab(v as 'mine' | 'shared')}
          options={[
            { value: 'mine', label: `${labels.tabMine} (${mine.length})` },
            { value: 'shared', label: `${labels.tabShared} (${shared.length})` },
          ]}
        />
        <Button onClick={openAdd}>
          <Plus />
          {labels.add}
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Dumbbell />}
          title={tab === 'mine' ? labels.emptyMineTitle : labels.emptySharedTitle}
          description={tab === 'mine' ? labels.emptyMineDescription : labels.emptySharedDescription}
          action={
            tab === 'mine' ? (
              <Button size="sm" onClick={openAdd}>
                {labels.add}
              </Button>
            ) : null
          }
        />
      ) : (
        <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((card) => (
            <RevealItem key={card.id}>
              <Card className="h-full transition-all duration-element ease-brand hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{card.name}</p>
                    {card.videoUrl ? (
                      <a
                        href={card.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                        aria-label={labels.watch}
                      >
                        <Video className="size-4" />
                      </a>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="muted" className="text-[11px] font-normal">
                      {card.muscleLabel}
                    </Badge>
                    <Badge variant="muted" className="text-[11px] font-normal">
                      {card.equipmentLabel}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {card.difficultyLabel}
                    </Badge>
                  </div>

                  <div className="mt-auto flex items-center gap-1 pt-2">
                    {card.isMine ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(card)}>
                          <Pencil />
                          {labels.edit}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={labels.delete}
                          onClick={() => remove(card.id, card.name)}
                          disabled={busy}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy(card.id)}
                        disabled={busy}
                      >
                        <Copy />
                        {labels.copyToMine}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? labels.editTitle : labels.addTitle}</DialogTitle>
            <DialogDescription>{labels.formSubtitle}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={labels.nameAr} htmlFor="ex-ar" required>
                <Input id="ex-ar" value={values.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
              </Field>
              <Field label={labels.nameEn} htmlFor="ex-en" required>
                <Input
                  id="ex-en"
                  dir="ltr"
                  value={values.nameEn}
                  onChange={(e) => set('nameEn', e.target.value)}
                />
              </Field>
            </div>

            <Field label={labels.muscleGroup} required>
              <ChipRadio
                value={values.muscleGroup}
                onChange={(v) => set('muscleGroup', v as ExerciseInput['muscleGroup'])}
                options={options.muscles}
              />
            </Field>

            <Field label={labels.equipment} required>
              <ChipRadio
                value={values.equipment}
                onChange={(v) => set('equipment', v as ExerciseInput['equipment'])}
                options={options.equipment}
              />
            </Field>

            <Field label={labels.difficulty} required>
              <ChipRadio
                value={values.difficulty}
                onChange={(v) => set('difficulty', v as ExerciseInput['difficulty'])}
                options={options.difficulty}
              />
            </Field>

            <Field label={labels.videoUrl} htmlFor="ex-video" hint={labels.videoHint}>
              <Input
                id="ex-video"
                dir="ltr"
                placeholder="https://…"
                value={values.videoUrl ?? ''}
                onChange={(e) => set('videoUrl', e.target.value)}
              />
            </Field>

            <Field label={labels.instructions} htmlFor="ex-cues">
              <Textarea
                id="ex-cues"
                rows={3}
                value={values.instructionsAr ?? ''}
                onChange={(e) => set('instructionsAr', e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={busy}>
              {labels.cancel}
            </Button>
            <Button onClick={save} loading={busy}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

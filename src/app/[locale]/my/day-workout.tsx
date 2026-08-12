'use client';

import { useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Loader2, PlayCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { logWorkoutItem } from './actions';

export interface WorkoutItemRow {
  id: string;
  name: string;
  muscleGroup: string;
  videoUrl: string | null;
  sets: number;
  reps: string;
  restSec: number;
  tempo: string | null;
  rpe: number | null;
  targetWeightKg: number | null;
  note: string | null;
  logged: { set: number; reps: number; weightKg: number | null }[] | null;
  loggedRpe: number | null;
}

/**
 * Today's session, with logging inline.
 *
 * Built for a phone held between sets: one exercise open at a time, the target
 * always visible above the inputs, and the set rows pre-filled with what the
 * coach prescribed so the common case — "I did exactly what it says" — is a
 * single tap rather than six fields.
 */
export function DayWorkout({
  locale,
  title,
  subtitle,
  note,
  items,
}: {
  locale: string;
  title: string;
  subtitle: string;
  note: string | null;
  items: WorkoutItemRow[];
}) {
  const isAr = locale === 'ar';
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<string | null>(items.find((i) => !i.logged)?.id ?? null);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {note ? <p className="mt-1 text-sm">{note}</p> : null}
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: reduced ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0 : 0.22,
              delay: reduced ? 0 : index * 0.05,
              ease: [0.32, 0.72, 0, 1],
            }}
          >
            <ExerciseRow
              item={item}
              isAr={isAr}
              open={open === item.id}
              onToggle={() => setOpen(open === item.id ? null : item.id)}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function ExerciseRow({
  item,
  isAr,
  open,
  onToggle,
}: {
  item: WorkoutItemRow;
  isAr: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { toast } = useToast();
  const [saving, startSaving] = useTransition();

  // Prefilled from the prescription, so an unchanged session is one tap.
  const [sets, setSets] = useState(() =>
    item.logged?.length
      ? item.logged.map((s) => ({ reps: String(s.reps), weightKg: s.weightKg?.toString() ?? '' }))
      : Array.from({ length: item.sets }, () => ({
          reps: item.reps.replace(/[^0-9]/g, '') || '10',
          weightKg: item.targetWeightKg?.toString() ?? '',
        })),
  );
  const [rpe, setRpe] = useState(item.loggedRpe?.toString() ?? '');

  function update(index: number, field: 'reps' | 'weightKg', value: string) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function save() {
    startSaving(async () => {
      const result = await logWorkoutItem({
        itemId: item.id,
        sets: sets.map((s, i) => ({
          set: i + 1,
          reps: Number(s.reps) || 0,
          weightKg: s.weightKg === '' ? null : Number(s.weightKg),
        })),
        rpe: rpe === '' ? null : Number(rpe),
      });

      toast(
        result.ok
          ? { title: isAr ? 'اتسجّل' : 'Logged', variant: 'success' }
          : { title: result.error ?? 'خطأ', variant: 'error' },
      );
    });
  }

  return (
    <Card className={cn('overflow-hidden', item.logged && 'border-success/40')}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-accent/40"
        aria-expanded={open}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            item.logged ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {item.logged ? <Check className="size-4" /> : item.sets}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            {item.sets} × {item.reps}
            {item.targetWeightKg ? ` · ${item.targetWeightKg}kg` : ''}
            {` · ${isAr ? 'راحة' : 'rest'} ${item.restSec}s`}
          </span>
        </span>

        {item.rpe ? <Badge variant="muted">RPE {item.rpe}</Badge> : null}
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <CardContent className="space-y-3 border-t p-4">
          {item.note ? <p className="text-sm text-muted-foreground">{item.note}</p> : null}

          <div className="space-y-2">
            {sets.map((set, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {isAr ? `مجموعة ${index + 1}` : `Set ${index + 1}`}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={set.reps}
                  onChange={(e) => update(index, 'reps', e.target.value)}
                  className="h-9"
                  aria-label={isAr ? 'عدات' : 'Reps'}
                  placeholder={isAr ? 'عدات' : 'Reps'}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  value={set.weightKg}
                  onChange={(e) => update(index, 'weightKg', e.target.value)}
                  className="h-9"
                  aria-label={isAr ? 'وزن' : 'Weight'}
                  placeholder={isAr ? 'كجم' : 'kg'}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              className="h-9 w-24"
              placeholder="RPE"
              aria-label="RPE"
            />
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {item.logged ? (isAr ? 'حدّث' : 'Update') : isAr ? 'سجّل' : 'Log it'}
            </Button>
            {item.videoUrl ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={item.videoUrl} target="_blank" rel="noreferrer">
                  <PlayCircle />
                  {isAr ? 'شوف الأداء' : 'Watch form'}
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

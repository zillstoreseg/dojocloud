'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Moon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  addWorkoutItem,
  updateWorkoutItem,
  deleteWorkoutItem,
  reorderWorkoutItems,
  setRestDay,
} from '../actions';

export interface ItemRow {
  id: string;
  exerciseName: string;
  muscleLabel: string;
  sets: number;
  reps: string;
  restSec: number;
  note: string | null;
}

export interface DayRow {
  id: string;
  dayNumber: number;
  title: string | null;
  isRestDay: boolean;
  items: ItemRow[];
}

export interface ExerciseOption {
  id: string;
  name: string;
  muscleLabel: string;
}

interface Props {
  day: DayRow;
  dayName: string;
  exercises: ExerciseOption[];
  labels: Record<string, string>;
}

/** One exercise row; the whole row is the drop target, the handle is the grip. */
function SortableItem({
  item,
  labels,
  onChange,
  onRemove,
  disabled,
}: {
  item: ItemRow;
  labels: Record<string, string>;
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border/60 bg-card p-2',
        // Lifting the dragged row is what makes the reorder legible; without
        // it the list just rearranges under the cursor.
        isDragging && 'z-10 shadow-lift',
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
        aria-label={labels.drag}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.exerciseName}</p>
        <p className="truncate text-xs text-muted-foreground">{item.muscleLabel}</p>
      </div>

      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        {labels.sets}
        <Input
          type="number"
          min={1}
          max={20}
          value={item.sets}
          onChange={(e) => onChange({ sets: Number(e.target.value) })}
          className="h-8 w-14 px-2 text-center"
          disabled={disabled}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        {labels.reps}
        <Input
          value={item.reps}
          onChange={(e) => onChange({ reps: e.target.value })}
          className="h-8 w-16 px-2 text-center"
          disabled={disabled}
        />
      </label>
      <label className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        {labels.rest}
        <Input
          type="number"
          min={0}
          max={600}
          step={15}
          value={item.restSec}
          onChange={(e) => onChange({ restSec: Number(e.target.value) })}
          className="h-8 w-16 px-2 text-center"
          disabled={disabled}
        />
      </label>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={labels.remove}
        onClick={onRemove}
        disabled={disabled}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </li>
  );
}

export function DayEditor({ day, dayName, exercises, labels }: Props) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, startBusy] = useTransition();

  // The list is held locally so a drag or an edit settles instantly, but the
  // server stays the source of truth: whenever `router.refresh()` delivers a
  // new `day.items`, the local copy is dropped in favour of it. Without this
  // reset the state would be frozen at its mount value and an added exercise
  // would never appear.
  const [items, setItems] = useState(day.items);
  const [serverItems, setServerItems] = useState(day.items);
  if (serverItems !== day.items) {
    setServerItems(day.items);
    setItems(day.items);
  }

  const sensors = useSensors(
    // A small activation distance keeps a click on the number inputs from
    // being swallowed as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);

    // Optimistic: the list settles immediately and the server catches up.
    setItems(next);
    startBusy(async () => {
      await reorderWorkoutItems({ dayId: day.id, itemIds: next.map((i) => i.id) });
      router.refresh();
    });
  }

  function patchItem(id: string, patch: Partial<ItemRow>) {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    setItems(next);
    const updated = next.find((i) => i.id === id)!;
    startBusy(async () => {
      await updateWorkoutItem({
        id,
        sets: updated.sets,
        reps: updated.reps,
        restSec: updated.restSec,
        note: updated.note ?? '',
      });
    });
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startBusy(async () => {
      await deleteWorkoutItem({ id });
      router.refresh();
    });
  }

  function addExercise(exerciseId: string) {
    setPickerOpen(false);
    startBusy(async () => {
      await addWorkoutItem({ dayId: day.id, exerciseId, sets: 3, reps: '10', restSec: 60 });
      router.refresh();
    });
  }

  function toggleRest(checked: boolean) {
    startBusy(async () => {
      await setRestDay({ dayId: day.id, isRestDay: checked });
      router.refresh();
    });
  }

  const filtered = query
    ? exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : exercises;

  return (
    <Card className={day.isRestDay ? 'opacity-70' : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold">{dayName}</span>
            {day.isRestDay ? (
              <Badge variant="muted" className="gap-1">
                <Moon className="size-3" />
                {labels.restDay}
              </Badge>
            ) : items.length > 0 ? (
              <Badge variant="muted">{labels.exerciseCount.replace('{n}', String(items.length))}</Badge>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {labels.restDay}
            <Switch checked={day.isRestDay} onCheckedChange={toggleRest} disabled={busy} />
          </label>
        </div>

        {day.isRestDay ? null : (
          <>
            {items.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        labels={labels}
                        disabled={busy}
                        onChange={(patch) => patchItem(item.id, patch)}
                        onRemove={() => removeItem(item.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="py-2 text-center text-sm text-muted-foreground">{labels.noExercises}</p>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setPickerOpen(true)}
              disabled={busy}
            >
              <Plus />
              {labels.addExercise}
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle>{labels.pickExercise}</DialogTitle>
            <DialogDescription>{labels.pickExerciseHint}</DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            placeholder={labels.searchExercise}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <ul className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">{labels.noMatches}</li>
            ) : (
              filtered.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => addExercise(exercise.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md p-2 text-start text-sm transition-colors hover:bg-accent"
                  >
                    <span className="truncate">{exercise.name}</span>
                    <Badge variant="muted" className="shrink-0 text-[11px] font-normal">
                      {exercise.muscleLabel}
                    </Badge>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

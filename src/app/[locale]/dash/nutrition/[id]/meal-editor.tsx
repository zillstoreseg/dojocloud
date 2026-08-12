'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { addMealItem, updateMealItemQty, deleteMealItem, deleteMeal } from '../actions';

export interface MealItemRow {
  id: string;
  foodName: string;
  qty: number;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealRow {
  id: string;
  name: string;
  items: MealItemRow[];
}

export interface FoodOption {
  id: string;
  name: string;
  baseQty: number;
  unit: string;
  kcal: number;
}

interface Props {
  meal: MealRow;
  foods: FoodOption[];
  labels: Record<string, string>;
}

export function MealEditor({ meal, foods, labels }: Props) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState(100);
  const [selected, setSelected] = useState<FoodOption | null>(null);
  const [busy, startBusy] = useTransition();

  const totals = meal.items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  function add() {
    if (!selected) return;
    startBusy(async () => {
      await addMealItem({ mealId: meal.id, foodId: selected.id, qty });
      setPickerOpen(false);
      setSelected(null);
      setQty(100);
      setQuery('');
      router.refresh();
    });
  }

  function changeQty(id: string, next: number) {
    startBusy(async () => {
      await updateMealItemQty({ id, qty: next });
      router.refresh();
    });
  }

  function removeItem(id: string) {
    startBusy(async () => {
      await deleteMealItem({ id });
      router.refresh();
    });
  }

  function removeMeal() {
    if (!confirm(labels.confirmDeleteMeal.replace('{name}', meal.name))) return;
    startBusy(async () => {
      await deleteMeal({ id: meal.id });
      router.refresh();
    });
  }

  const filtered = query
    ? foods.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : foods;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold">{meal.name}</span>
            {meal.items.length > 0 ? (
              <Badge variant="muted" className="tabular-nums">
                {Math.round(totals.kcal)} {labels.kcal}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {meal.items.length > 0 ? (
              <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                {labels.p} {Math.round(totals.protein)} · {labels.c} {Math.round(totals.carbs)} ·{' '}
                {labels.f} {Math.round(totals.fat)}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={labels.deleteMeal}
              onClick={removeMeal}
              disabled={busy}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        </div>

        {meal.items.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{labels.noItems}</p>
        ) : (
          <ul className="space-y-1.5">
            {meal.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-border/60 p-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{item.foodName}</span>

                <Input
                  type="number"
                  min={1}
                  step={10}
                  defaultValue={item.qty}
                  onBlur={(e) => {
                    const next = Number(e.target.value);
                    if (next !== item.qty) changeQty(item.id, next);
                  }}
                  className="h-8 w-20 px-2 text-center tabular-nums"
                  disabled={busy}
                />
                <span className="w-6 text-xs text-muted-foreground">{item.unit}</span>

                <span className="w-16 text-end text-sm tabular-nums text-muted-foreground">
                  {Math.round(item.kcal)}
                </span>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.remove}
                  onClick={() => removeItem(item.id)}
                  disabled={busy}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
        >
          <Plus />
          {labels.addFood}
        </Button>
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle>{labels.pickFood}</DialogTitle>
            <DialogDescription>{labels.pickFoodHint}</DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            placeholder={labels.searchFood}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {selected ? (
            <div className="flex items-end gap-3 rounded-md border border-primary/40 bg-accent/40 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.kcal} {labels.kcal} / {selected.baseQty}
                  {selected.unit}
                </p>
              </div>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                {labels.qty}
                <Input
                  type="number"
                  min={1}
                  step={10}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="h-8 w-20 px-2 text-center"
                />
              </label>
              <Button size="sm" onClick={add} loading={busy}>
                {labels.add}
              </Button>
            </div>
          ) : null}

          <ul className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">{labels.noMatches}</li>
            ) : (
              filtered.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(food);
                      setQty(Number(food.baseQty));
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-md p-2 text-start text-sm transition-colors hover:bg-accent"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <UtensilsCrossed className="size-3.5 shrink-0 text-muted-foreground" />
                      {food.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {food.kcal} / {food.baseQty}
                      {food.unit}
                    </span>
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

import { describe, expect, it } from 'vitest';
import { totalsOf, rescaleItem, type FoodScanItem } from '@/lib/ai/food-scan';
import { judgeMeal } from '@/lib/nutrition';
import { verdictMessage, VERDICT_LABELS } from '@/lib/verdict';
import { costOf } from '@/lib/ai/client';

const rice: FoodScanItem = {
  nameAr: 'أرز أبيض',
  nameEn: 'White rice',
  grams: 150,
  kcal: 195,
  protein: 4,
  carbs: 42,
  fat: 0.5,
  confidence: 0.8,
};

const chicken: FoodScanItem = {
  nameAr: 'صدور فراخ',
  nameEn: 'Chicken breast',
  grams: 120,
  kcal: 198,
  protein: 37,
  carbs: 0,
  fat: 4,
  confidence: 0.9,
};

describe('totalsOf', () => {
  it('sums the plate', () => {
    const totals = totalsOf([rice, chicken]);
    expect(totals.kcal).toBe(393);
    expect(totals.protein).toBe(41);
    expect(totals.carbs).toBe(42);
    expect(totals.fat).toBe(5); // 0.5 + 4 = 4.5, rounded
  });

  it('weights confidence by calorie share, not item count', () => {
    // A guessed garnish worth 5 kcal must not drag a confident 400 kcal meal
    // down to the average of the two numbers.
    const garnish: FoodScanItem = { ...rice, grams: 3, kcal: 5, confidence: 0.1 };
    const totals = totalsOf([chicken, garnish]);
    expect(totals.confidence).toBeGreaterThan(0.85);
  });

  it('does not divide by zero on an empty plate', () => {
    expect(totalsOf([]).confidence).toBe(0);
    expect(totalsOf([]).kcal).toBe(0);
  });
});

describe('rescaleItem', () => {
  it('scales macros linearly with weight', () => {
    const doubled = rescaleItem(rice, 300);
    expect(doubled.grams).toBe(300);
    expect(doubled.kcal).toBe(390);
    expect(doubled.carbs).toBe(84);
  });

  it('scales down as well as up', () => {
    const halved = rescaleItem(chicken, 60);
    expect(halved.kcal).toBe(99);
    expect(halved.protein).toBe(18.5);
  });

  it('survives an item the model reported with zero weight', () => {
    const zeroed: FoodScanItem = { ...rice, grams: 0 };
    expect(rescaleItem(zeroed, 100).grams).toBe(100);
  });

  it('refuses a negative correction', () => {
    expect(rescaleItem(rice, -50).grams).toBe(0);
  });
});

describe('the verdict, at its boundaries', () => {
  const base = {
    dailyTarget: 2000,
    consumedToday: 0,
    mealsPerDay: 4,
    goal: 'LOSE_FAT' as const,
  };
  // Expected share: 2000 / 4 = 500 kcal. Tolerance ±10% → 450…550.

  it('fits exactly on the share', () => {
    expect(judgeMeal({ ...base, mealCalories: 500 }).verdict).toBe('FITS');
  });

  it('fits at the top of the tolerance', () => {
    expect(judgeMeal({ ...base, mealCalories: 550 }).verdict).toBe('FITS');
  });

  it('goes over one calorie past it', () => {
    expect(judgeMeal({ ...base, mealCalories: 551 }).verdict).toBe('OVER');
  });

  it('does not flag eating short when the goal is to lose fat', () => {
    expect(judgeMeal({ ...base, mealCalories: 200 }).verdict).toBe('FITS');
  });

  it('does flag eating short when the goal is to build muscle', () => {
    const result = judgeMeal({ ...base, mealCalories: 200, goal: 'BUILD_MUSCLE' });
    expect(result.verdict).toBe('UNDER');
  });

  it('calls a modest meal OVER once the day is already spent', () => {
    // 300 kcal is well under a 500 share, but there are only 100 left.
    const result = judgeMeal({ ...base, mealCalories: 300, consumedToday: 1900 });
    expect(result.verdict).toBe('OVER');
    expect(result.remainingAfter).toBe(-200);
  });

  it('lets an excluded food beat the arithmetic', () => {
    const result = judgeMeal({ ...base, mealCalories: 500, hasExcludedItem: true });
    expect(result.verdict).toBe('OFF_PLAN');
  });

  it('does not accuse a trainee whose target has not been computed yet', () => {
    // A missing height leaves dailyTarget at 0. Judging against it would call
    // every meal OVER, which is a verdict made out of missing data.
    const result = judgeMeal({ ...base, dailyTarget: 0, mealCalories: 500 });
    expect(result.verdict).toBe('FITS');
    expect(Number.isFinite(result.deviation)).toBe(true);
    expect(verdictMessage(result, 'LOSE_FAT', 500).ar).toContain('مفيش هدف');
  });

  it('still refuses an excluded food with no target', () => {
    const result = judgeMeal({ ...base, dailyTarget: 0, mealCalories: 500, hasExcludedItem: true });
    expect(result.verdict).toBe('OFF_PLAN');
  });
});

describe('the sentence the trainee reads', () => {
  const budget = { dailyTarget: 2000, consumedToday: 0, mealsPerDay: 4, goal: 'LOSE_FAT' as const };

  it('quotes the same numbers the verdict computed', () => {
    const result = judgeMeal({ ...budget, mealCalories: 900 });
    const message = verdictMessage(result, 'LOSE_FAT', 900);
    expect(message.ar).toContain('900');
    expect(message.ar).toContain('500'); // the expected share
    expect(message.en).toContain('900');
  });

  it('changes with the goal on an identical meal', () => {
    const meal = { mealCalories: 200 };
    const cutting = judgeMeal({ ...budget, ...meal });
    const bulking = judgeMeal({ ...budget, ...meal, goal: 'BUILD_MUSCLE' });

    expect(cutting.verdict).toBe('FITS');
    expect(bulking.verdict).toBe('UNDER');
    expect(verdictMessage(cutting, 'LOSE_FAT', 200).ar).not.toBe(
      verdictMessage(bulking, 'BUILD_MUSCLE', 200).ar,
    );
  });

  it('says the day is blown when it is', () => {
    const result = judgeMeal({ ...budget, mealCalories: 800, consumedToday: 1800 });
    const message = verdictMessage(result, 'LOSE_FAT', 800);
    expect(message.ar).toContain('600'); // the overshoot
  });

  it('has a label and a message for every verdict', () => {
    for (const verdict of ['FITS', 'OVER', 'UNDER', 'OFF_PLAN'] as const) {
      expect(VERDICT_LABELS[verdict].ar.length).toBeGreaterThan(0);
      expect(VERDICT_LABELS[verdict].en.length).toBeGreaterThan(0);
    }
  });

  it('never emits Arabic-Indic digits', () => {
    // The product renders Latin numerals throughout; a stray ٥ in one sentence
    // reads as a different font and breaks the line.
    const result = judgeMeal({ ...budget, mealCalories: 900 });
    const message = verdictMessage(result, 'LOSE_FAT', 900);
    expect(message.ar).not.toMatch(/[٠-٩۰-۹]/);
  });
});

describe('cost accounting', () => {
  const prices = { inputPricePerMTok: 5, outputPricePerMTok: 25 };

  it('prices a call from the admin-set rates', () => {
    // 1M in + 1M out at $5/$25.
    expect(costOf(prices, 1_000_000, 1_000_000)).toBe(30);
  });

  it('keeps a cheap call from rounding to zero', () => {
    // A single scan: ~1.5k input tokens, ~600 output.
    const cost = costOf(prices, 1500, 600);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(0.0225, 6);
  });

  it('charges nothing for nothing', () => {
    expect(costOf(prices, 0, 0)).toBe(0);
  });
});

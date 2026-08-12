import { describe, expect, it } from 'vitest';
import {
  bmi,
  bmr,
  tdee,
  macrosFor,
  energyTargets,
  ageFrom,
  judgeMeal,
  KCAL_PER_GRAM,
} from '@/lib/nutrition';

describe('bmi', () => {
  it('matches the textbook figure', () => {
    // 80kg at 180cm → 80 / 1.8² = 24.69
    expect(bmi(80, 180)).toBe(24.7);
  });

  it('returns zero rather than Infinity for a missing height', () => {
    expect(bmi(80, 0)).toBe(0);
  });
});

describe('bmr (Mifflin-St Jeor)', () => {
  it('computes the male formula', () => {
    // 10(80) + 6.25(180) − 5(30) + 5 = 800 + 1125 − 150 + 5
    expect(bmr({ weightKg: 80, heightCm: 180, age: 30, sex: 'MALE' })).toBe(1780);
  });

  it('computes the female formula', () => {
    // 10(60) + 6.25(165) − 5(28) − 161 = 600 + 1031.25 − 140 − 161
    expect(bmr({ weightKg: 60, heightCm: 165, age: 28, sex: 'FEMALE' })).toBe(1330);
  });

  it('gives a lower figure for an older person, all else equal', () => {
    const young = bmr({ weightKg: 80, heightCm: 180, age: 25, sex: 'MALE' });
    const older = bmr({ weightKg: 80, heightCm: 180, age: 55, sex: 'MALE' });
    expect(older).toBeLessThan(young);
  });
});

describe('tdee', () => {
  it('applies the activity multiplier', () => {
    expect(tdee(1780, 'SEDENTARY')).toBe(2136);
    expect(tdee(1780, 'MODERATE')).toBe(2759);
    expect(tdee(1780, 'ATHLETE')).toBe(3382);
  });

  it('rises monotonically with activity', () => {
    const levels = ['SEDENTARY', 'LIGHT', 'MODERATE', 'HIGH', 'ATHLETE'] as const;
    const values = levels.map((level) => tdee(1700, level));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

describe('macrosFor', () => {
  it('anchors protein to bodyweight, not to a share of calories', () => {
    // Fat loss: 2.2 g/kg × 80kg
    expect(macrosFor(2000, 80, 'LOSE_FAT').protein).toBe(176);
    // Halving calories must not halve protein — that is the whole point.
    expect(macrosFor(1000, 80, 'LOSE_FAT').protein).toBe(176);
  });

  it('splits the remaining calories into fat and carbs', () => {
    const m = macrosFor(2400, 80, 'BUILD_MUSCLE');
    const total =
      m.protein * KCAL_PER_GRAM.protein +
      m.carbs * KCAL_PER_GRAM.carbs +
      m.fat * KCAL_PER_GRAM.fat;
    // Rounding to whole grams costs a few calories; anything larger is a bug.
    expect(Math.abs(total - 2400)).toBeLessThanOrEqual(10);
  });

  it('never emits negative carbs when protein alone exceeds the target', () => {
    const m = macrosFor(500, 100, 'LOSE_FAT');
    expect(m.carbs).toBeGreaterThanOrEqual(0);
    expect(m.fat).toBeGreaterThanOrEqual(0);
  });
});

describe('energyTargets', () => {
  const base = {
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'MALE' as const,
    activity: 'MODERATE' as const,
  };

  it('cuts for fat loss and adds for muscle gain', () => {
    const cut = energyTargets({ ...base, goal: 'LOSE_FAT' });
    const gain = energyTargets({ ...base, goal: 'BUILD_MUSCLE' });
    const maintain = energyTargets({ ...base, goal: 'GENERAL_HEALTH' });

    expect(cut.calorieTarget).toBeLessThan(maintain.calorieTarget);
    expect(gain.calorieTarget).toBeGreaterThan(maintain.calorieTarget);
    expect(maintain.calorieTarget).toBe(maintain.tdee);
  });

  it('keeps the deficit sustainable rather than extreme', () => {
    const cut = energyTargets({ ...base, goal: 'LOSE_FAT' });
    expect(cut.calorieTarget / cut.tdee).toBeCloseTo(0.8, 2);
  });
});

describe('ageFrom', () => {
  it('does not count a birthday that has not happened yet this year', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    expect(ageFrom(new Date('1996-06-14T00:00:00Z'), now)).toBe(30);
    expect(ageFrom(new Date('1996-06-16T00:00:00Z'), now)).toBe(29);
  });
});

describe('judgeMeal', () => {
  const base = {
    dailyTarget: 2000,
    consumedToday: 0,
    mealsPerDay: 4, // expected share = 500
    goal: 'LOSE_FAT' as const,
  };

  it('accepts a meal within tolerance of its share', () => {
    expect(judgeMeal({ ...base, mealCalories: 500 }).verdict).toBe('FITS');
    expect(judgeMeal({ ...base, mealCalories: 545 }).verdict).toBe('FITS');
    expect(judgeMeal({ ...base, mealCalories: 460 }).verdict).toBe('FITS');
  });

  it('flags a meal over its share', () => {
    expect(judgeMeal({ ...base, mealCalories: 700 }).verdict).toBe('OVER');
  });

  it('does not flag eating under when the goal is fat loss', () => {
    expect(judgeMeal({ ...base, mealCalories: 300 }).verdict).toBe('FITS');
  });

  it('flags eating under when the goal is to gain', () => {
    expect(judgeMeal({ ...base, mealCalories: 300, goal: 'BUILD_MUSCLE' }).verdict).toBe('UNDER');
  });

  it('calls the day over once the budget is blown, even for a small meal', () => {
    const result = judgeMeal({ ...base, mealCalories: 400, consumedToday: 1900 });
    expect(result.verdict).toBe('OVER');
    expect(result.remainingAfter).toBeLessThan(0);
  });

  it('lets an excluded ingredient override the arithmetic', () => {
    // Exactly on target, but the coach ruled the food out.
    const result = judgeMeal({ ...base, mealCalories: 500, hasExcludedItem: true });
    expect(result.verdict).toBe('OFF_PLAN');
  });

  it('reports how far the meal sat from its expected share', () => {
    const result = judgeMeal({ ...base, mealCalories: 750 });
    expect(result.expectedShare).toBe(500);
    expect(result.deviation).toBeCloseTo(0.5, 5);
  });

  it('treats a zero meals-per-day as one rather than dividing by zero', () => {
    const result = judgeMeal({ ...base, mealCalories: 500, mealsPerDay: 0 });
    expect(Number.isFinite(result.expectedShare)).toBe(true);
    expect(result.expectedShare).toBe(2000);
  });
});

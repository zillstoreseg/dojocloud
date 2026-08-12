/**
 * Nutrition arithmetic: energy needs, calorie targets, and macro splits.
 *
 * Deliberately free of Prisma and of any AI call. The same functions decide
 * what a coach's nutrition plan should add up to *and* whether a photographed
 * meal fits — so the verdict a trainee sees is computed here, in code that can
 * be tested, rather than asked of a language model whose answer would vary
 * between identical meals.
 */

export type Goal =
  | 'LOSE_FAT'
  | 'BUILD_MUSCLE'
  | 'RECOMP'
  | 'STRENGTH'
  | 'ENDURANCE'
  | 'GENERAL_HEALTH'
  | 'REHAB';

export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'HIGH' | 'ATHLETE';

export type Sex = 'MALE' | 'FEMALE';

/** All values in grams. */
export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

export interface EnergyTargets {
  bmi: number;
  bmr: number;
  tdee: number;
  calorieTarget: number;
  macros: Macros;
}

/** Physical Activity Level multipliers applied to BMR to reach TDEE. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  HIGH: 1.725,
  ATHLETE: 1.9,
};

/**
 * Calorie adjustment per goal, as a fraction of TDEE.
 *
 * Kept modest on purpose: −20% is an aggressive but sustainable deficit, and
 * a +10% surplus builds muscle without excessive fat gain. Anything steeper
 * would be a nutrition claim this system has no business making on its own.
 */
export const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  LOSE_FAT: -0.2,
  BUILD_MUSCLE: 0.1,
  RECOMP: 0,
  STRENGTH: 0.05,
  ENDURANCE: 0.05,
  GENERAL_HEALTH: 0,
  REHAB: 0,
};

/**
 * Protein grams per kg of bodyweight, and the share of remaining calories
 * that comes from fat. Carbs take whatever is left.
 */
const GOAL_MACRO_RULES: Record<Goal, { proteinPerKg: number; fatShare: number }> = {
  LOSE_FAT: { proteinPerKg: 2.2, fatShare: 0.3 },
  BUILD_MUSCLE: { proteinPerKg: 2.0, fatShare: 0.25 },
  RECOMP: { proteinPerKg: 2.2, fatShare: 0.28 },
  STRENGTH: { proteinPerKg: 2.0, fatShare: 0.28 },
  ENDURANCE: { proteinPerKg: 1.6, fatShare: 0.25 },
  GENERAL_HEALTH: { proteinPerKg: 1.6, fatShare: 0.3 },
  REHAB: { proteinPerKg: 1.8, fatShare: 0.3 },
};

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

/** Body mass index. `heightCm` in centimetres, `weightKg` in kilograms. */
export function bmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) return 0;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

/**
 * Basal metabolic rate — Mifflin-St Jeor, which predicts measured RMR more
 * accurately than Harris-Benedict across mixed populations.
 */
export function bmr(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return Math.round(input.sex === 'MALE' ? base + 5 : base - 161);
}

/** Total daily energy expenditure. */
export function tdee(basal: number, activity: ActivityLevel): number {
  return Math.round(basal * ACTIVITY_FACTORS[activity]);
}

/**
 * Splits a calorie target into macros.
 *
 * Protein is anchored to bodyweight rather than to a percentage, because a
 * percentage of a small deficit target leaves too little protein to protect
 * lean mass — the failure mode of most generated diets.
 */
export function macrosFor(calories: number, weightKg: number, goal: Goal): Macros {
  const rule = GOAL_MACRO_RULES[goal];

  const protein = Math.round(rule.proteinPerKg * weightKg);
  const proteinKcal = protein * KCAL_PER_GRAM.protein;

  // If protein alone overshoots the target there is nothing left to split;
  // clamp rather than emit negative carbohydrate.
  const remaining = Math.max(0, calories - proteinKcal);
  const fat = Math.round((remaining * rule.fatShare) / KCAL_PER_GRAM.fat);
  const carbs = Math.round((remaining - fat * KCAL_PER_GRAM.fat) / KCAL_PER_GRAM.carbs);

  return { protein, carbs: Math.max(0, carbs), fat };
}

/** Everything a plan or a scan verdict needs, from one intake. */
export function energyTargets(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: ActivityLevel;
  goal: Goal;
}): EnergyTargets {
  const basal = bmr(input);
  const total = tdee(basal, input.activity);
  const calorieTarget = Math.round(total * (1 + GOAL_CALORIE_ADJUSTMENT[input.goal]));

  return {
    bmi: bmi(input.weightKg, input.heightCm),
    bmr: basal,
    tdee: total,
    calorieTarget,
    macros: macrosFor(calorieTarget, input.weightKg, input.goal),
  };
}

/** Age in whole years, used when an intake stores a birth date. */
export function ageFrom(birthDate: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return Math.max(0, age);
}

// ───────────────────────────────────────────────── meal verdict ─────

export type MealVerdict = 'FITS' | 'OVER' | 'UNDER' | 'OFF_PLAN';

/** How far from the expected share a meal may sit and still count as fitting. */
export const VERDICT_TOLERANCE = 0.1;

export interface VerdictInput {
  /** Calories in the meal being judged. */
  mealCalories: number;
  /** The trainee's daily calorie target. */
  dailyTarget: number;
  /** Calories already logged today, before this meal. */
  consumedToday: number;
  /** How many meals the day is split into; drives the expected share. */
  mealsPerDay: number;
  goal: Goal;
  /** Set when the meal contains something the plan excludes. */
  hasExcludedItem?: boolean;
}

export interface VerdictResult {
  verdict: MealVerdict;
  /** Calories left for the rest of the day after this meal. */
  remainingAfter: number;
  /** What a meal was expected to cost at this point in the day. */
  expectedShare: number;
  /** Signed difference from the expected share, as a fraction. */
  deviation: number;
}

/**
 * Judges one meal against the day's budget.
 *
 * An excluded ingredient wins over the arithmetic: a meal can land exactly on
 * target and still be wrong if the coach ruled the food out.
 */
export function judgeMeal(input: VerdictInput): VerdictResult {
  const mealsPerDay = Math.max(1, input.mealsPerDay);
  const expectedShare = input.dailyTarget / mealsPerDay;
  const remainingAfter = input.dailyTarget - input.consumedToday - input.mealCalories;
  const deviation = expectedShare > 0 ? (input.mealCalories - expectedShare) / expectedShare : 0;

  if (input.hasExcludedItem) {
    return { verdict: 'OFF_PLAN', remainingAfter, expectedShare, deviation };
  }

  // Blowing the whole day's budget is over regardless of how this single meal
  // compares to its own share.
  if (remainingAfter < 0) {
    return { verdict: 'OVER', remainingAfter, expectedShare, deviation };
  }

  if (deviation > VERDICT_TOLERANCE) {
    return { verdict: 'OVER', remainingAfter, expectedShare, deviation };
  }

  // A shortfall only matters when the goal is to gain; on a deficit, eating
  // under is not a problem worth flagging.
  const gaining = input.goal === 'BUILD_MUSCLE' || input.goal === 'STRENGTH';
  if (gaining && deviation < -VERDICT_TOLERANCE) {
    return { verdict: 'UNDER', remainingAfter, expectedShare, deviation };
  }

  return { verdict: 'FITS', remainingAfter, expectedShare, deviation };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

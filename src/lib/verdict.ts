import type { Goal, MealVerdict, VerdictResult } from './nutrition';

/**
 * The sentence a trainee reads under their meal.
 *
 * Written here rather than asked of the model, for the same reason the verdict
 * itself is: the same plate and the same budget must always produce the same
 * words. A model that phrases it warmly one time and sternly the next teaches
 * a trainee to re-photograph until it says something nice.
 *
 * The wording changes with the goal, because "300 calories over" means
 * something different to someone cutting than to someone bulking.
 */

export interface VerdictMessage {
  ar: string;
  en: string;
}

const GOAL_AR: Record<Goal, string> = {
  LOSE_FAT: 'التنشيف',
  BUILD_MUSCLE: 'بناء العضل',
  RECOMP: 'إعادة التكوين',
  STRENGTH: 'زيادة القوة',
  ENDURANCE: 'التحمّل',
  GENERAL_HEALTH: 'الصحة العامة',
  REHAB: 'التأهيل',
};

const GOAL_EN: Record<Goal, string> = {
  LOSE_FAT: 'fat loss',
  BUILD_MUSCLE: 'building muscle',
  RECOMP: 'recomposition',
  STRENGTH: 'strength',
  ENDURANCE: 'endurance',
  GENERAL_HEALTH: 'general health',
  REHAB: 'rehab',
};

export const VERDICT_LABELS: Record<MealVerdict, { ar: string; en: string }> = {
  FITS: { ar: 'مناسبة', en: 'Fits' },
  OVER: { ar: 'سعرات عالية', en: 'Too many calories' },
  UNDER: { ar: 'أقل من اللازم', en: 'Under target' },
  OFF_PLAN: { ar: 'خارج خطتك', en: 'Off your plan' },
};

export const VERDICT_TONES: Record<MealVerdict, 'success' | 'warning' | 'destructive' | 'info'> = {
  FITS: 'success',
  OVER: 'destructive',
  UNDER: 'warning',
  OFF_PLAN: 'warning',
};

/**
 * Turns the arithmetic into a sentence.
 *
 * Every number quoted comes from the verdict that was already computed, so the
 * text can never disagree with the badge above it.
 */
export function verdictMessage(
  result: VerdictResult,
  goal: Goal,
  mealCalories: number,
): VerdictMessage {
  const expected = Math.round(result.expectedShare);
  const remaining = Math.round(result.remainingAfter);
  const kcal = Math.round(mealCalories);

  // No target means no judgement. Say what the meal was and what is missing,
  // rather than inventing a verdict the numbers cannot support.
  if (result.expectedShare <= 0 && result.verdict === 'FITS') {
    return {
      ar: `الوجبة دي ${kcal} سعر. لسه مفيش هدف سعرات محسوب لك — كمّل بياناتك أو استنى مدربك يكتب لك نظام.`,
      en: `This meal is ${kcal} kcal. You have no calorie target yet — complete your profile or wait for your coach's plan.`,
    };
  }

  switch (result.verdict) {
    case 'OFF_PLAN':
      return {
        ar: 'في صنف في الوجبة دي مدربك مستبعده أو بيتعارض مع نظامك. كلّمه قبل ما تكررها.',
        en: 'This meal contains something your coach ruled out. Check with them before repeating it.',
      };

    case 'OVER': {
      if (remaining < 0) {
        return {
          ar: `الوجبة دي ${kcal} سعر، وبكده عديت ميزانية اليوم بـ ${Math.abs(remaining)} سعر. هدفك ${GOAL_AR[goal]}، فحاول تعوّضها بحركة زيادة أو وجبة أخف بكرة.`,
          en: `This meal is ${kcal} kcal and puts you ${Math.abs(remaining)} kcal over today's budget. Your goal is ${GOAL_EN[goal]}, so make it up with movement or a lighter day tomorrow.`,
        };
      }
      return {
        ar: `الوجبة دي ${kcal} سعر، والمفروض تكون حوالي ${expected}. لسه فاضلك ${remaining} سعر النهارده، بس خد بالك من باقي وجباتك.`,
        en: `This meal is ${kcal} kcal where about ${expected} was expected. You still have ${remaining} kcal left today — watch the rest of your meals.`,
      };
    }

    case 'UNDER':
      return {
        ar: `الوجبة دي ${kcal} سعر بس، والمفروض حوالي ${expected}. هدفك ${GOAL_AR[goal]}، والأكل الأقل من اللازم بيبطّأ التقدم. زوّد مصدر بروتين أو نشويات.`,
        en: `This meal is only ${kcal} kcal where about ${expected} was expected. Your goal is ${GOAL_EN[goal]} — eating short of target slows it down. Add protein or carbs.`,
      };

    default:
      return {
        ar: `تمام. ${kcal} سعر في حدود المتوقع (${expected})، وفاضلك ${remaining} سعر النهارده.`,
        en: `On target. ${kcal} kcal against an expected ${expected}, with ${remaining} kcal left today.`,
      };
  }
}

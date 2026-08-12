import type {
  ActivityLevel as PrismaActivity,
  Difficulty,
  Equipment,
  MuscleGroup,
  TraineeStatus,
  TrainingGoal,
} from '@prisma/client';
import type { ActivityLevel, Goal } from './nutrition';

/**
 * Labels and mappings for the training domain.
 *
 * The Prisma enums and the nutrition module's own vocabulary were defined
 * separately and do not line up one-to-one, so the translation lives here in
 * one place rather than being re-derived at each call site.
 */

export const GOAL_LABELS: Record<TrainingGoal, { ar: string; en: string }> = {
  WEIGHT_LOSS: { ar: 'خسارة وزن', en: 'Weight loss' },
  MUSCLE_GAIN: { ar: 'زيادة عضلية', en: 'Muscle gain' },
  RECOMPOSITION: { ar: 'إعادة تكوين', en: 'Recomposition' },
  STRENGTH: { ar: 'قوة', en: 'Strength' },
  ENDURANCE: { ar: 'تحمّل', en: 'Endurance' },
  GENERAL_HEALTH: { ar: 'صحة عامة', en: 'General health' },
  REHAB: { ar: 'إعادة تأهيل', en: 'Rehabilitation' },
};

export const ACTIVITY_LABELS: Record<PrismaActivity, { ar: string; en: string }> = {
  SEDENTARY: { ar: 'خامل', en: 'Sedentary' },
  LIGHT: { ar: 'نشاط خفيف', en: 'Lightly active' },
  MODERATE: { ar: 'نشاط متوسط', en: 'Moderately active' },
  ACTIVE: { ar: 'نشط', en: 'Active' },
  VERY_ACTIVE: { ar: 'نشط جدًا', en: 'Very active' },
};

export const TRAINEE_STATUS_LABELS: Record<TraineeStatus, { ar: string; en: string }> = {
  ACTIVE: { ar: 'نشط', en: 'Active' },
  PAUSED: { ar: 'موقوف مؤقتًا', en: 'Paused' },
  EXPIRED: { ar: 'منتهٍ', en: 'Expired' },
  ARCHIVED: { ar: 'مؤرشف', en: 'Archived' },
};

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, { ar: string; en: string }> = {
  CHEST: { ar: 'صدر', en: 'Chest' },
  BACK: { ar: 'ظهر', en: 'Back' },
  SHOULDERS: { ar: 'أكتاف', en: 'Shoulders' },
  BICEPS: { ar: 'باي', en: 'Biceps' },
  TRICEPS: { ar: 'تراي', en: 'Triceps' },
  FOREARMS: { ar: 'سواعد', en: 'Forearms' },
  QUADS: { ar: 'أمامي الفخذ', en: 'Quads' },
  HAMSTRINGS: { ar: 'خلفي الفخذ', en: 'Hamstrings' },
  GLUTES: { ar: 'مؤخرة', en: 'Glutes' },
  CALVES: { ar: 'سمانة', en: 'Calves' },
  ABS: { ar: 'بطن', en: 'Abs' },
  FULL_BODY: { ar: 'الجسم كامل', en: 'Full body' },
  CARDIO: { ar: 'كارديو', en: 'Cardio' },
  MOBILITY: { ar: 'مرونة', en: 'Mobility' },
};

export const EQUIPMENT_LABELS: Record<Equipment, { ar: string; en: string }> = {
  BODYWEIGHT: { ar: 'وزن الجسم', en: 'Bodyweight' },
  BARBELL: { ar: 'بار', en: 'Barbell' },
  DUMBBELL: { ar: 'دمبل', en: 'Dumbbell' },
  KETTLEBELL: { ar: 'كيتل بل', en: 'Kettlebell' },
  MACHINE: { ar: 'جهاز', en: 'Machine' },
  CABLE: { ar: 'كابل', en: 'Cable' },
  RESISTANCE_BAND: { ar: 'حبل مقاومة', en: 'Resistance band' },
  SMITH_MACHINE: { ar: 'سميث', en: 'Smith machine' },
  MEDICINE_BALL: { ar: 'كرة طبية', en: 'Medicine ball' },
  CARDIO_MACHINE: { ar: 'جهاز كارديو', en: 'Cardio machine' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

export const DIFFICULTY_LABELS: Record<Difficulty, { ar: string; en: string }> = {
  BEGINNER: { ar: 'مبتدئ', en: 'Beginner' },
  INTERMEDIATE: { ar: 'متوسط', en: 'Intermediate' },
  ADVANCED: { ar: 'متقدم', en: 'Advanced' },
};

/** Generic label reader for the maps above. */
export function label(
  map: Record<string, { ar: string; en: string }>,
  key: string | null | undefined,
  locale: string,
  fallback = '—',
): string {
  if (!key) return fallback;
  const entry = map[key];
  if (!entry) return key;
  return locale === 'ar' ? entry.ar : entry.en;
}

/**
 * Maps the Prisma training goal onto the nutrition module's goal.
 *
 * `RECOMPOSITION` and `RECOMP` mean the same thing under different names, and
 * the nutrition module has no `WEIGHT_LOSS` — it calls that `LOSE_FAT`.
 */
export function nutritionGoal(goal: TrainingGoal | null | undefined): Goal {
  switch (goal) {
    case 'WEIGHT_LOSS':
      return 'LOSE_FAT';
    case 'MUSCLE_GAIN':
      return 'BUILD_MUSCLE';
    case 'RECOMPOSITION':
      return 'RECOMP';
    case 'STRENGTH':
      return 'STRENGTH';
    case 'ENDURANCE':
      return 'ENDURANCE';
    case 'REHAB':
      return 'REHAB';
    default:
      return 'GENERAL_HEALTH';
  }
}

/**
 * Maps the Prisma activity level onto the nutrition module's five-point scale.
 * `ACTIVE` and `VERY_ACTIVE` correspond to `HIGH` and `ATHLETE`.
 */
export function nutritionActivity(level: PrismaActivity | null | undefined): ActivityLevel {
  switch (level) {
    case 'SEDENTARY':
      return 'SEDENTARY';
    case 'LIGHT':
      return 'LIGHT';
    case 'ACTIVE':
      return 'HIGH';
    case 'VERY_ACTIVE':
      return 'ATHLETE';
    default:
      return 'MODERATE';
  }
}

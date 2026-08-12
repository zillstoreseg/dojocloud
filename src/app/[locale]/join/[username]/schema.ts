import { z } from 'zod';

/**
 * The intake questionnaire, shared by the client wizard and the server action.
 *
 * Split into steps so the wizard can validate one at a time, and composed into
 * a single schema so the server validates the whole thing at once regardless of
 * what the client did. Nothing here is optional-by-accident: every field a
 * coach needs to write a real plan is required, and everything else is not
 * asked for.
 */

export const GOALS = [
  'WEIGHT_LOSS',
  'MUSCLE_GAIN',
  'RECOMPOSITION',
  'STRENGTH',
  'ENDURANCE',
  'GENERAL_HEALTH',
  'REHAB',
] as const;

export const ACTIVITY_LEVELS = [
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
] as const;

export const SPORT_LEVELS = ['BEGINNER', 'CLUB', 'COMPETITIVE', 'PRO'] as const;
export const TRAINING_PLACES = ['HOME', 'GYM', 'OUTDOOR'] as const;
export const DIET_PREFERENCES = [
  'NONE',
  'VEGETARIAN',
  'VEGAN',
  'PESCATARIAN',
  'KETO',
  'LOW_CARB',
  'HALAL_ONLY',
  'GLUTEN_FREE',
  'LACTOSE_FREE',
] as const;
export const EQUIPMENT = [
  'BODYWEIGHT',
  'BARBELL',
  'DUMBBELL',
  'KETTLEBELL',
  'MACHINE',
  'CABLE',
  'RESISTANCE_BAND',
  'CARDIO_MACHINE',
] as const;

const list = (max: number) => z.array(z.string().trim().max(80)).max(max).default([]);

export const intakeSchema = z.object({
  // Who you are
  fullName: z.string().trim().min(2, 'اكتب اسمك بالكامل').max(120),
  phone: z.string().trim().min(6, 'اكتب رقم هاتف صحيح').max(30),
  email: z.string().trim().email('بريد غير صحيح').max(160).optional().or(z.literal('')),
  /**
   * Optional: choosing one opens the trainee portal.
   *
   * Not required, because plenty of trainees will only ever deal with their
   * coach over the phone and forcing a password on them would lose the
   * subscription at the last step. Enforced against the email in
   * `intakeSchema`'s refinement below — a password with nowhere to sign in to
   * is a dead end.
   */
  password: z.string().min(8, 'الباسورد لازم 8 حروف على الأقل').max(72).optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE']),
  birthDate: z
    .string()
    .refine((v) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      return age >= 12 && age <= 100;
    }, 'تاريخ ميلاد غير منطقي'),

  // Your body and your goal
  heightCm: z.number().min(100, 'الطول لازم يكون بين 100 و250').max(250),
  weightKg: z.number().min(25, 'الوزن لازم يكون بين 25 و300').max(300),
  goal: z.enum(GOALS),
  targetWeightKg: z.number().min(25).max(300).optional().nullable(),

  // How you live and train
  activityLevel: z.enum(ACTIVITY_LEVELS),
  isAthlete: z.boolean().default(false),
  sportType: z.string().trim().max(80).optional().or(z.literal('')),
  sportLevel: z.enum(SPORT_LEVELS).optional().nullable(),
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(240),
  trainingPlace: z.enum(TRAINING_PLACES),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).default([]),
  previousExperienceYears: z.number().int().min(0).max(60).default(0),

  // Health
  injuries: list(10),
  medicalConditions: list(10),
  medications: z.string().trim().max(500).optional().or(z.literal('')),
  allergies: list(10),

  // Food and lifestyle
  dietPreference: z.enum(DIET_PREFERENCES).default('NONE'),
  dislikedFoods: list(20),
  mealsPerDay: z.number().int().min(1).max(8),
  sleepHours: z.number().int().min(3).max(14),
  waterLiters: z.number().min(0).max(10).optional().nullable(),
  smokes: z.boolean().default(false),
  workSchedule: z.string().trim().max(200).optional().or(z.literal('')),
  stressLevel: z.number().int().min(1).max(5),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
})
  .refine((v) => !v.password || Boolean(v.email), {
    message: 'محتاجين بريدك عشان تقدر تدخل بالباسورد ده',
    path: ['email'],
  });

export type IntakeValues = z.infer<typeof intakeSchema>;
export type IntakeInput = z.input<typeof intakeSchema>;

/** Which fields belong to which wizard step, in order. */
export const INTAKE_STEPS: (keyof IntakeInput)[][] = [
  ['fullName', 'phone', 'email', 'password', 'gender', 'birthDate'],
  ['heightCm', 'weightKg', 'goal', 'targetWeightKg'],
  [
    'activityLevel',
    'isAthlete',
    'sportType',
    'sportLevel',
    'trainingDaysPerWeek',
    'sessionMinutes',
    'trainingPlace',
    'equipment',
    'previousExperienceYears',
  ],
  ['injuries', 'medicalConditions', 'medications', 'allergies'],
  [
    'dietPreference',
    'dislikedFoods',
    'mealsPerDay',
    'sleepHours',
    'waterLiters',
    'smokes',
    'workSchedule',
    'stressLevel',
    'notes',
  ],
];

/**
 * Validates one step by parsing the whole object and keeping only the issues
 * that belong to it. `.pick()` would be the obvious approach but it drops
 * cross-field refinements, so a step would pass here and fail on the server.
 */
export function validateIntakeStep(
  step: number,
  values: IntakeInput,
): Record<string, string> {
  const fields = new Set<string>(INTAKE_STEPS[step] as string[]);
  const result = intakeSchema.safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (fields.has(key) && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export const EMPTY_INTAKE: IntakeInput = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  gender: 'MALE',
  birthDate: '',
  heightCm: 170,
  weightKg: 70,
  goal: 'WEIGHT_LOSS',
  targetWeightKg: null,
  activityLevel: 'MODERATE',
  isAthlete: false,
  sportType: '',
  sportLevel: null,
  trainingDaysPerWeek: 3,
  sessionMinutes: 60,
  trainingPlace: 'GYM',
  equipment: [],
  previousExperienceYears: 0,
  injuries: [],
  medicalConditions: [],
  medications: '',
  allergies: [],
  dietPreference: 'NONE',
  dislikedFoods: [],
  mealsPerDay: 3,
  sleepHours: 7,
  waterLiters: null,
  smokes: false,
  workSchedule: '',
  stressLevel: 3,
  notes: '',
};

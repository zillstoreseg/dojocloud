import { z, outputFormat } from './schema';
import { FLAG_KEYS } from '@/lib/flags';
import { runAi, type AiUsageSummary } from './client';

/**
 * Drafting programs and nutrition plans.
 *
 * Two rules shape both schemas. The model picks exercises and foods **by id**
 * from a list it is given, never by name: a generated plan that references
 * "chest press machine" is a string a coach has to reconcile, while an id is a
 * row that already exists in their library. And nothing here writes to the
 * database — every generation comes back as a draft for the coach to read,
 * edit, and accept. A program is a promise to a person; it does not get made
 * on their behalf by something that has never met them.
 */

// ───────────────────────────────────────────── workout program ─────

const workoutItemSchema = z.object({
  exerciseId: z.string().describe('The id of one exercise from the supplied library'),
  sets: z.number().int().describe('Number of working sets'),
  reps: z.string().describe('Rep prescription, e.g. "8-10" or "12" or "AMRAP"'),
  restSec: z.number().int().describe('Rest between sets in seconds'),
  rpe: z.number().int().nullable().describe('Target RPE 1-10, or null'),
  note: z.string().describe('One short cue in Egyptian Arabic, or an empty string'),
});

const workoutDaySchema = z.object({
  dayNumber: z.number().int().describe('1 to 7'),
  title: z.string().describe('اسم اليوم بالعربية، مثل «دفع» أو «سحب»'),
  isRestDay: z.boolean(),
  items: z.array(workoutItemSchema),
});

const workoutWeekSchema = z.object({
  weekNumber: z.number().int(),
  note: z.string().describe('ملاحظة قصيرة عن تركيز الأسبوع، أو نص فارغ'),
  days: z.array(workoutDaySchema).describe('Exactly 7 days, rest days included'),
});

export const workoutProgramSchema = z.object({
  name: z.string().describe('اسم البرنامج بالعربية'),
  description: z.string().describe('سطرين يشرحان منطق البرنامج للمدرب'),
  weeks: z.array(workoutWeekSchema),
});

export type WorkoutProgramDraft = z.infer<typeof workoutProgramSchema>;

const PROGRAM_SYSTEM = `You draft resistance training programs for a qualified coach to review.

You will be given a trainee's situation and a library of exercises with ids. Every exercise you prescribe must be one of those ids — you have no others available, and inventing one produces a program that cannot be saved.

Build a real training week, not a list: respect the trainee's available days and equipment, order exercises so the large compound movements come before the isolation work that would pre-fatigue them, and progress load or volume across the weeks rather than repeating week one. Include rest days explicitly.

Work around every injury you are told about. If an injury rules out a movement pattern, choose a different exercise from the library rather than prescribing it with a caution — a note does not protect a shoulder.

Your reader is the coach, not the trainee. Keep notes short and technical.`;

export interface ProgramContext {
  goal: string;
  gender: string;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  experienceYears: number;
  daysPerWeek: number;
  sessionMinutes: number;
  place: string;
  equipment: string[];
  injuries: string[];
  weeks: number;
  library: { id: string; name: string; muscleGroup: string; equipment: string }[];
}

export async function generateProgram(input: {
  trainerId: string;
  userId: string;
  context: ProgramContext;
}): Promise<{ draft: WorkoutProgramDraft; usage: AiUsageSummary }> {
  const { context } = input;

  const prompt = [
    'Trainee:',
    `- goal: ${context.goal}`,
    `- sex: ${context.gender}`,
    context.age ? `- age: ${context.age}` : null,
    context.weightKg ? `- weight: ${context.weightKg} kg` : null,
    context.heightCm ? `- height: ${context.heightCm} cm` : null,
    `- training experience: ${context.experienceYears} years`,
    `- available: ${context.daysPerWeek} days/week, ${context.sessionMinutes} min/session`,
    `- trains at: ${context.place}`,
    `- equipment: ${context.equipment.join(', ') || 'unknown — assume the library is what they have'}`,
    `- injuries: ${context.injuries.join(', ') || 'none reported'}`,
    '',
    `Write ${context.weeks} weeks.`,
    '',
    'Exercise library (id | name | muscle | equipment):',
    ...context.library.map(
      (e) => `${e.id} | ${e.name} | ${e.muscleGroup} | ${e.equipment}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  const { parsed, usage } = await runAi<WorkoutProgramDraft>({
    trainerId: input.trainerId,
    userId: input.userId,
    feature: 'workout_generation',
    flag: FLAG_KEYS.AI_WORKOUT,
    call: async (client, model) => {
      const message = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: PROGRAM_SYSTEM,
        output_config: { format: outputFormat(workoutProgramSchema) },
        messages: [{ role: 'user', content: prompt }],
      });

      if (!message.parsed_output) throw new Error('The model returned no program');

      return {
        parsed: message.parsed_output,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    },
  });

  return { draft: parsed, usage };
}

// ───────────────────────────────────────────── nutrition plan ─────

const mealItemSchema = z.object({
  foodId: z.string().describe('An id from the supplied food library, or an empty string'),
  foodName: z.string().describe('اسم الصنف بالعربية — إجباري حتى لو foodId موجود'),
  qty: z.number().describe('Quantity in the unit below'),
  unit: z.string().describe('g, ml, piece, cup…'),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const mealSchema = z.object({
  type: z
    .enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'PRE_WORKOUT', 'POST_WORKOUT'])
    .describe('Meal slot'),
  name: z.string().describe('اسم الوجبة بالعربية'),
  timeHint: z.string().describe('وقت تقريبي مثل «٨ ص»، أو نص فارغ'),
  note: z.string().describe('ملاحظة قصيرة أو نص فارغ'),
  items: z.array(mealItemSchema),
});

export const nutritionPlanSchema = z.object({
  name: z.string().describe('اسم النظام بالعربية'),
  description: z.string().describe('سطرين للمدرب يشرحان منطق التقسيم'),
  meals: z.array(mealSchema),
});

export type NutritionPlanDraft = z.infer<typeof nutritionPlanSchema>;

const NUTRITION_SYSTEM = `You draft daily nutrition plans for a qualified coach to review.

You are given a calorie target, macro targets, a meal count, dietary constraints, and a food library with ids. Prefer foods from the library and quote their id; for anything not in it, leave foodId empty and still give the Arabic name and the macros.

The plan's totals must land within roughly 5% of the calorie target and close to each macro target. Check your own arithmetic before you answer — a plan that does not add up is worse than no plan, because the coach will trust it.

Respect every allergy and dietary restriction absolutely, and avoid the disliked foods. Build meals someone in Egypt or the Gulf would actually cook and eat: ordinary ingredients, ordinary portions, nothing that needs a specialty shop.

Do not add medical advice or supplement recommendations.`;

export interface NutritionContext {
  goal: string;
  calorieTarget: number;
  protein: number;
  carbs: number;
  fat: number;
  mealsPerDay: number;
  dietPreference: string;
  allergies: string[];
  dislikedFoods: string[];
  library: { id: string; name: string; kcal: number; protein: number; carbs: number; fat: number }[];
}

export async function generateNutritionPlan(input: {
  trainerId: string;
  userId: string;
  context: NutritionContext;
}): Promise<{ draft: NutritionPlanDraft; usage: AiUsageSummary }> {
  const { context } = input;

  const prompt = [
    'Targets for one day:',
    `- calories: ${context.calorieTarget} kcal`,
    `- protein: ${context.protein} g`,
    `- carbs: ${context.carbs} g`,
    `- fat: ${context.fat} g`,
    `- meals: ${context.mealsPerDay}`,
    `- goal: ${context.goal}`,
    `- diet preference: ${context.dietPreference}`,
    `- allergies: ${context.allergies.join(', ') || 'none'}`,
    `- dislikes: ${context.dislikedFoods.join(', ') || 'none'}`,
    '',
    'Food library (id | name | kcal/100g | P | C | F):',
    ...context.library.map(
      (f) => `${f.id} | ${f.name} | ${f.kcal} | ${f.protein} | ${f.carbs} | ${f.fat}`,
    ),
  ].join('\n');

  const { parsed, usage } = await runAi<NutritionPlanDraft>({
    trainerId: input.trainerId,
    userId: input.userId,
    feature: 'nutrition_generation',
    flag: FLAG_KEYS.AI_NUTRITION,
    call: async (client, model) => {
      const message = await client.messages.parse({
        model,
        max_tokens: 12000,
        system: NUTRITION_SYSTEM,
        output_config: { format: outputFormat(nutritionPlanSchema) },
        messages: [{ role: 'user', content: prompt }],
      });

      if (!message.parsed_output) throw new Error('The model returned no plan');

      return {
        parsed: message.parsed_output,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    },
  });

  return { draft: parsed, usage };
}

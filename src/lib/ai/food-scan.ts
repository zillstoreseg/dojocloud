import sharp from 'sharp';
import { z, outputFormat } from './schema';
import { FLAG_KEYS } from '@/lib/flags';
import { runAi, type AiUsageSummary } from './client';

/**
 * Reading a photographed meal.
 *
 * The model is asked for one thing only: what is on the plate and roughly how
 * much of it. It is never asked whether the meal is a good idea — that verdict
 * is arithmetic against the trainee's own targets and is computed in
 * `lib/nutrition.ts`, where it can be tested and explained. A sentence of
 * encouragement from a language model can be neither.
 */

export const FOOD_SCAN_FEATURE = 'food_scan';

/** The maximum long edge Claude uses for vision; anything larger is wasted tokens. */
const MAX_EDGE = 1568;

export const foodItemSchema = z.object({
  nameAr: z.string().describe('اسم الصنف بالعربية المصرية، كلمتان على الأكثر'),
  nameEn: z.string().describe('The item name in English'),
  grams: z.number().describe('Estimated edible weight in grams'),
  kcal: z.number().describe('Calories for that weight'),
  protein: z.number().describe('Protein in grams'),
  carbs: z.number().describe('Carbohydrates in grams'),
  fat: z.number().describe('Fat in grams'),
  confidence: z
    .number()
    .describe('0 to 1 — how sure you are about this item and its portion size'),
});

export const foodScanSchema = z.object({
  isFood: z.boolean().describe('False if the picture does not show food at all'),
  titleAr: z.string().describe('وصف قصير للوجبة كلها بالعربية'),
  titleEn: z.string().describe('A short description of the whole meal in English'),
  items: z.array(foodItemSchema),
  notesAr: z
    .string()
    .describe('ملاحظة قصيرة عن طريقة الطهي أو أي شيء أثّر في التقدير، أو نص فارغ'),
});

export type FoodScanReading = z.infer<typeof foodScanSchema>;
export type FoodScanItem = z.infer<typeof foodItemSchema>;

/**
 * Shrinks and re-encodes a photo before it is stored or sent anywhere.
 *
 * `sharp` drops all metadata by default, which is the point: a phone photo of
 * lunch carries GPS coordinates, and neither this platform nor Anthropic has
 * any business knowing where a trainee eats. `rotate()` first so that stripping
 * the orientation tag does not leave the picture on its side.
 */
export async function prepareMealImage(
  bytes: Buffer,
): Promise<{ full: Buffer; thumb: Buffer; contentType: string }> {
  const base = sharp(bytes).rotate();

  const full = await base
    .clone()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const thumb = await base
    .clone()
    .resize({ width: 320, height: 320, fit: 'cover' })
    .jpeg({ quality: 70 })
    .toBuffer();

  return { full, thumb, contentType: 'image/jpeg' };
}

/** Sums an item list. Used for the model's reading and again after the trainee edits it. */
export function totalsOf(items: FoodScanItem[]): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
} {
  const sum = items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  // The meal is only as trustworthy as its least certain component, weighted by
  // how much of the plate that component is: a confident 300 kcal of rice next
  // to a guessed 20 kcal of garnish should not read as a coin flip.
  const totalKcal = sum.kcal || 1;
  const confidence = items.reduce(
    (acc, item) => acc + item.confidence * (item.kcal / totalKcal),
    0,
  );

  return {
    kcal: Math.round(sum.kcal),
    protein: Math.round(sum.protein),
    carbs: Math.round(sum.carbs),
    fat: Math.round(sum.fat),
    confidence: Math.min(1, Math.max(0, Math.round(confidence * 100) / 100)),
  };
}

/**
 * Rescales one item to a corrected weight.
 *
 * When a trainee says the rice was 250g rather than 150g, the macros move with
 * it linearly — no second API call. Correcting a portion is the most common
 * thing they will do, and paying for a round trip to multiply by a ratio would
 * be absurd.
 */
export function rescaleItem(item: FoodScanItem, grams: number): FoodScanItem {
  if (item.grams <= 0 || grams <= 0) return { ...item, grams: Math.max(0, grams) };
  const ratio = grams / item.grams;
  return {
    ...item,
    grams,
    kcal: Math.round(item.kcal * ratio),
    protein: Math.round(item.protein * ratio * 10) / 10,
    carbs: Math.round(item.carbs * ratio * 10) / 10,
    fat: Math.round(item.fat * ratio * 10) / 10,
  };
}

const SYSTEM_PROMPT = `You read photographs of meals and report what is on the plate.

Estimate the edible weight of every distinct component in grams, then its calories and macros for that weight. Judge portion size from the visual references in the frame — plate rim, cutlery, hands, cans — and from how the food is served. Account for cooking method: fried food carries absorbed oil, grilled meat has lost water weight, and a sauce is rarely negligible.

Report a confidence between 0 and 1 for each item. Be honest when a portion is genuinely ambiguous or a component is hidden under another; a low number is useful information, an inflated one is not.

Never comment on whether the meal is healthy, on-plan, or advisable. That judgement is made elsewhere from the person's own targets, and an opinion here would contradict it.

If the picture shows no food, set isFood to false and return an empty item list.`;

export interface AnalyzeMealInput {
  trainerId: string;
  userId: string;
  /** The coach's user id — their plan owns the flag and the daily limit. */
  coachUserId: string;
  image: Buffer;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Foods the coach has ruled out, passed so the model can name them if present. */
  avoid?: string[];
}

/**
 * Sends one photo to Claude and returns its reading.
 *
 * Deliberately anonymous: the request carries the picture and, at most, a list
 * of foods to watch for. No name, no age, no goal, no coach — nothing that
 * would turn a nutrition estimate into a personal record held by a third party.
 */
export async function analyzeMeal(
  input: AnalyzeMealInput,
): Promise<{ reading: FoodScanReading; usage: AiUsageSummary }> {
  const avoidLine = input.avoid?.length
    ? `\n\nName these explicitly if you see them: ${input.avoid.join(', ')}.`
    : '';

  const { parsed, usage } = await runAi<FoodScanReading>({
    trainerId: input.trainerId,
    userId: input.userId,
    flagUserId: input.coachUserId,
    feature: FOOD_SCAN_FEATURE,
    flag: FLAG_KEYS.AI_FOOD_SCAN,
    call: async (client, model) => {
      const message = await client.messages.parse({
        model,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        output_config: { format: outputFormat(foodScanSchema) },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: input.mediaType,
                  data: input.image.toString('base64'),
                },
              },
              { type: 'text', text: `List everything in this meal.${avoidLine}` },
            ],
          },
        ],
      });

      if (!message.parsed_output) throw new Error('The model returned no structured reading');

      return {
        parsed: message.parsed_output,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    },
  });

  return { reading: parsed, usage };
}

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { getSetting } from '@/lib/settings';
import { FLAG_KEYS, isFeatureEnabled } from '@/lib/flags';
import { QUOTA_KEYS, assertQuota, consumeQuota } from '@/lib/quota';

/**
 * The one place the platform talks to Claude.
 *
 * Every call routes through `runAi` so that four things can never be
 * forgotten: the feature flag, the coach's quota, the usage row, and the
 * dollar cost. Callers describe *what* they want; the accounting is not their
 * problem, and it is not optional.
 */

export class AiUnavailableError extends Error {
  constructor(readonly reason: 'NO_KEY' | 'DISABLED' | 'FEATURE_OFF') {
    super(`AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
  }
}

export interface AiConfig {
  apiKey: string;
  model: string;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
}

/**
 * Reads the admin-managed configuration. The key lives encrypted in
 * `AppSetting`, never in an environment variable, so a platform owner can
 * rotate it from the panel without a deploy.
 */
export async function aiConfig(): Promise<AiConfig | null> {
  const [apiKey, model, inputPrice, outputPrice] = await Promise.all([
    getSetting('ai.api_key'),
    getSetting('ai.model'),
    getSetting('ai.input_price_per_mtok'),
    getSetting('ai.output_price_per_mtok'),
  ]);

  if (!apiKey.trim()) return null;

  return {
    apiKey: apiKey.trim(),
    model: model.trim() || 'claude-opus-5',
    inputPricePerMTok: Number(inputPrice) || 0,
    outputPricePerMTok: Number(outputPrice) || 0,
  };
}

/** Whether the AI section of the product should render at all, and why not. */
export async function aiStatus(userId: string): Promise<
  { ready: true; model: string } | { ready: false; reason: 'NO_KEY' | 'DISABLED' }
> {
  if (!(await isFeatureEnabled(userId, FLAG_KEYS.AI_ENABLED))) {
    return { ready: false, reason: 'DISABLED' };
  }
  const config = await aiConfig();
  if (!config) return { ready: false, reason: 'NO_KEY' };
  return { ready: true, model: config.model };
}

export interface AiUsageSummary {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  usageId: string | null;
}

export interface RunAiResult<T> {
  parsed: T;
  usage: AiUsageSummary;
}

/** Dollars for a call, from the admin's price-per-million-tokens settings. */
export function costOf(
  config: Pick<AiConfig, 'inputPricePerMTok' | 'outputPricePerMTok'>,
  inputTokens: number,
  outputTokens: number,
): number {
  const cost =
    (inputTokens / 1_000_000) * config.inputPricePerMTok +
    (outputTokens / 1_000_000) * config.outputPricePerMTok;
  // Six decimals matches the Decimal(12,6) column; a single cheap call is worth
  // fractions of a cent and rounding it to zero would hide the running total.
  return Math.round(cost * 1e6) / 1e6;
}

export interface RunAiInput<T> {
  /** The coach whose plan pays for this call. */
  trainerId: string;
  /** The signed-in user who triggered it — a coach or one of their trainees. */
  userId: string;
  /**
   * Whose flags decide whether this is allowed. Defaults to `userId`, but a
   * trainee-triggered call passes the coach's user id: a trainee has no plan
   * of their own, and the feature they are using belongs to their coach's.
   */
  flagUserId?: string;
  /** Short identifier for the admin's AI usage report, e.g. `food_scan`. */
  feature: string;
  /** Product flag guarding this specific feature, on top of the AI kill switch. */
  flag: string;
  /** Called with a configured client; returns the parsed payload and token counts. */
  call: (
    client: Anthropic,
    model: string,
  ) => Promise<{ parsed: T; inputTokens: number; outputTokens: number }>;
}

/**
 * Runs one AI call with the flag check, the quota check, and the bookkeeping.
 *
 * The quota is asserted before the call and consumed after it: a request that
 * fails on Anthropic's side should not spend a credit the coach paid for, but
 * one that succeeds must always spend one, even if what happens downstream
 * throws.
 *
 * Failures are recorded too. An `AiUsage` row with `success: false` costs
 * nothing and is the only way the admin's failure-rate figure can be honest.
 */
export async function runAi<T>(input: RunAiInput<T>): Promise<RunAiResult<T>> {
  const flagUserId = input.flagUserId ?? input.userId;

  if (!(await isFeatureEnabled(flagUserId, FLAG_KEYS.AI_ENABLED))) {
    throw new AiUnavailableError('DISABLED');
  }
  if (!(await isFeatureEnabled(flagUserId, input.flag))) {
    throw new AiUnavailableError('FEATURE_OFF');
  }

  const config = await aiConfig();
  if (!config) throw new AiUnavailableError('NO_KEY');

  await assertQuota(input.trainerId, QUOTA_KEYS.AI_GENERATIONS);

  const client = new Anthropic({ apiKey: config.apiKey });
  const startedAt = Date.now();

  let result: { parsed: T; inputTokens: number; outputTokens: number };
  try {
    result = await input.call(client, config.model);
  } catch (error) {
    await prisma.aiUsage
      .create({
        data: {
          userId: input.userId,
          trainerId: input.trainerId,
          feature: input.feature,
          model: config.model,
          success: false,
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
          durationMs: Date.now() - startedAt,
        },
      })
      .catch(() => undefined);
    throw error;
  }

  const costUsd = costOf(config, result.inputTokens, result.outputTokens);

  const usage = await prisma.aiUsage.create({
    data: {
      userId: input.userId,
      trainerId: input.trainerId,
      feature: input.feature,
      model: config.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      success: true,
      durationMs: Date.now() - startedAt,
    },
    select: { id: true },
  });

  await consumeQuota(input.trainerId, QUOTA_KEYS.AI_GENERATIONS);

  return {
    parsed: result.parsed,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      usageId: usage.id,
    },
  };
}

import { cache } from 'react';
import { prisma } from './prisma';

/**
 * Feature flag keys used across the app. Adding one here and seeding it makes
 * it manageable from the admin panel.
 */
export const FLAG_KEYS = {
  AI_ENABLED: 'ai.enabled',
  AI_WORKOUT: 'ai.workout_generation',
  AI_NUTRITION: 'ai.nutrition_generation',
  AI_PROGRESS_SUMMARY: 'ai.progress_summary',
  BUILDER: 'builder.enabled',
  BUILDER_CUSTOM_HTML: 'builder.custom_html',
  BUILDER_REMOVE_BRANDING: 'builder.remove_branding',
  BUILDER_CUSTOM_DOMAIN: 'builder.custom_domain',
  LEADS_CRM: 'leads.crm',
  DIRECTORY_LISTING: 'directory.listing',
  DIRECTORY_FEATURED: 'directory.featured',
  MESSAGING: 'messaging.enabled',
  TRAINEE_PORTAL: 'trainee.portal',
  EXPORT_DATA: 'data.export',
  TEAM_SEATS: 'team.seats',
} as const;

export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];

export interface ResolvedFlag {
  key: string;
  enabled: boolean;
  limit: number | null;
  /** Which layer decided the outcome — surfaced in the admin flag inspector. */
  source: 'kill-switch' | 'user' | 'plan' | 'default';
}

/**
 * Resolves every flag for a user by layering:
 *   global default → plan → user override   (last one wins)
 * A kill switch that is off overrides all layers.
 *
 * Memoised per request via React `cache`, so repeated checks inside one render
 * hit the database once.
 */
export const resolveFlags = cache(async (userId: string): Promise<Map<string, ResolvedFlag>> => {
  const [flags, user] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        featureOverrides: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { flagKey: true, enabled: true, limitValue: true },
        },
        trainerProfile: {
          select: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                plan: {
                  select: {
                    planFeatures: { select: { flagKey: true, enabled: true, limitValue: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const planFeatures = new Map(
    (user?.trainerProfile?.subscriptions[0]?.plan.planFeatures ?? []).map((f) => [f.flagKey, f]),
  );
  const userOverrides = new Map((user?.featureOverrides ?? []).map((o) => [o.flagKey, o]));

  const result = new Map<string, ResolvedFlag>();

  for (const flag of flags) {
    let enabled = flag.defaultEnabled;
    let limit = flag.defaultLimit;
    let source: ResolvedFlag['source'] = 'default';

    const planFeature = planFeatures.get(flag.key);
    if (planFeature) {
      enabled = planFeature.enabled;
      limit = planFeature.limitValue ?? limit;
      source = 'plan';
    }

    const override = userOverrides.get(flag.key);
    if (override) {
      enabled = override.enabled;
      limit = override.limitValue ?? limit;
      source = 'user';
    }

    // A disabled kill switch beats every other layer.
    if (flag.isKillSwitch && !flag.defaultEnabled) {
      enabled = false;
      limit = 0;
      source = 'kill-switch';
    }

    // Admins are never gated by product flags.
    if (user?.role === 'ADMIN' && source !== 'kill-switch') {
      enabled = true;
      limit = null;
    }

    result.set(flag.key, { key: flag.key, enabled, limit, source });
  }

  return result;
});

export async function isFeatureEnabled(userId: string, key: FlagKey | string): Promise<boolean> {
  const flags = await resolveFlags(userId);
  return flags.get(key)?.enabled ?? false;
}

export async function getFeatureLimit(userId: string, key: FlagKey | string): Promise<number | null> {
  const flags = await resolveFlags(userId);
  return flags.get(key)?.limit ?? null;
}

export class FeatureDisabledError extends Error {
  constructor(readonly flagKey: string) {
    super(`Feature not available on your plan: ${flagKey}`);
    this.name = 'FeatureDisabledError';
  }
}

/** Throws unless the flag is on for this user. */
export async function requireFeature(userId: string, key: FlagKey | string): Promise<void> {
  if (!(await isFeatureEnabled(userId, key))) throw new FeatureDisabledError(key);
}

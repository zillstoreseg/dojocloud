'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, toActionError } from '@/lib/authz';
import { audit } from '@/lib/audit';
import type { ActionResult } from '../activations/actions';

export type { ActionResult };

const flagSchema = z.object({
  key: z.string().trim().min(2).regex(/^[a-z0-9_.]+$/, 'المفتاح: حروف صغيرة وأرقام ونقطة وشرطة سفلية'),
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  type: z.enum(['BOOLEAN', 'LIMIT']),
  defaultEnabled: z.boolean(),
  defaultLimit: z.number().int().min(0).nullable().optional(),
  category: z.string().trim().optional(),
  isKillSwitch: z.boolean(),
});

export async function saveFlag(input: z.infer<typeof flagSchema>): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('flags.write');
    const data = flagSchema.parse(input);

    await prisma.featureFlag.upsert({
      where: { key: data.key },
      create: { ...data, description: data.description ?? null, category: data.category ?? null },
      update: {
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        defaultEnabled: data.defaultEnabled,
        defaultLimit: data.defaultLimit ?? null,
        category: data.category ?? null,
        isKillSwitch: data.isKillSwitch,
      },
    });

    await audit({ actorId: admin.id, action: 'flag.save', entity: 'FeatureFlag', entityId: data.key, after: data });
    revalidatePath('/[locale]/admin/flags', 'page');
    return { ok: true, message: 'تم حفظ الميزة' };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    return toActionError(error);
  }
}

export async function toggleFlagDefault(input: { key: string; enabled: boolean }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('flags.write');
    const flag = await prisma.featureFlag.update({
      where: { key: input.key },
      data: { defaultEnabled: input.enabled },
    });

    await audit({
      actorId: admin.id,
      action: flag.isKillSwitch ? 'flag.kill_switch' : 'flag.toggle_default',
      entity: 'FeatureFlag',
      entityId: input.key,
      after: { defaultEnabled: input.enabled },
    });

    revalidatePath('/[locale]/admin/flags', 'page');
    return {
      ok: true,
      message: flag.isKillSwitch && !input.enabled ? 'تم إيقاف الميزة للجميع' : 'تم التحديث',
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteFlag(input: { key: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('flags.write');
    await prisma.featureFlag.delete({ where: { key: input.key } });
    await audit({ actorId: admin.id, action: 'flag.delete', entity: 'FeatureFlag', entityId: input.key });
    revalidatePath('/[locale]/admin/flags', 'page');
    return { ok: true, message: 'تم حذف الميزة' };
  } catch (error) {
    return toActionError(error);
  }
}

/** Grants or revokes a feature for one user, overriding their plan. */
export async function setUserOverride(input: {
  userId: string;
  flagKey: string;
  enabled: boolean;
  limitValue?: number | null;
  reason?: string;
  expiresAt?: string | null;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('flags.write');

    await prisma.userFeatureOverride.upsert({
      where: { userId_flagKey: { userId: input.userId, flagKey: input.flagKey } },
      create: {
        userId: input.userId,
        flagKey: input.flagKey,
        enabled: input.enabled,
        limitValue: input.limitValue ?? null,
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      update: {
        enabled: input.enabled,
        limitValue: input.limitValue ?? null,
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    await audit({
      actorId: admin.id,
      action: 'flag.user_override',
      entity: 'UserFeatureOverride',
      entityId: `${input.userId}:${input.flagKey}`,
      after: input,
    });

    revalidatePath('/[locale]/admin/flags', 'page');
    return { ok: true, message: 'تم ضبط الاستثناء' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeUserOverride(input: { userId: string; flagKey: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('flags.write');
    await prisma.userFeatureOverride.delete({
      where: { userId_flagKey: { userId: input.userId, flagKey: input.flagKey } },
    });
    await audit({
      actorId: admin.id,
      action: 'flag.user_override.remove',
      entity: 'UserFeatureOverride',
      entityId: `${input.userId}:${input.flagKey}`,
    });
    revalidatePath('/[locale]/admin/flags', 'page');
    return { ok: true, message: 'تم حذف الاستثناء' };
  } catch (error) {
    return toActionError(error);
  }
}

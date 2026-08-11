'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, toActionError } from '@/lib/authz';
import { setSettings, SETTING_DEFS, type SettingKey } from '@/lib/settings';
import { audit } from '@/lib/audit';
import type { ActionResult } from '../activations/actions';

export type { ActionResult };

/**
 * Saves a batch of settings. Secret values (API keys) are encrypted by the
 * settings layer and never echoed back to the client or written to the audit
 * trail — only the fact that they changed is recorded.
 */
export async function saveSettings(values: Record<string, string>): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('settings.write');

    const clean: Partial<Record<SettingKey, string>> = {};
    const changedSecretKeys: string[] = [];
    const changedPlainKeys: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
      if (!(key in SETTING_DEFS)) continue;
      const def = SETTING_DEFS[key as SettingKey];
      // An untouched secret field posts back as an empty string; skip it so we
      // don't wipe a stored key by saving the form.
      if (def.secret && value === '') continue;
      clean[key as SettingKey] = value;
      if (def.secret) changedSecretKeys.push(key);
      else changedPlainKeys[key] = value;
    }

    await setSettings(clean, admin.id);
    await audit({
      actorId: admin.id,
      action: 'settings.update',
      entity: 'AppSetting',
      after: { ...changedPlainKeys, secretsChanged: changedSecretKeys },
    });

    revalidatePath('/[locale]', 'layout');
    return { ok: true, message: 'تم حفظ الإعدادات' };
  } catch (error) {
    return toActionError(error);
  }
}

/** Clears a stored secret, e.g. to disable AI by removing the API key. */
export async function clearSecret(input: { key: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('settings.write');
    const key = z.string().parse(input.key) as SettingKey;
    if (!(key in SETTING_DEFS) || !SETTING_DEFS[key].secret) {
      return { ok: false, error: 'مفتاح غير صالح' };
    }

    await setSettings({ [key]: '' }, admin.id);
    await audit({ actorId: admin.id, action: 'settings.clear_secret', entity: 'AppSetting', entityId: key });

    revalidatePath('/[locale]/admin/settings', 'page');
    return { ok: true, message: 'تم مسح المفتاح' };
  } catch (error) {
    return toActionError(error);
  }
}

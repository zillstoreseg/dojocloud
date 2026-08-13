'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Specialty } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTrainer, toActionError } from '@/lib/authz';
import { audit } from '@/lib/audit';
import { uploadFile } from '@/lib/storage';
import { hashPassword, verifyPassword } from '@/lib/password';
import { syncDirectoryCounters } from '@/lib/directory';
import {
  usernameSchema,
  isUsernameAvailable,
  USERNAME_CHANGE_COOLDOWN_DAYS,
} from '@/lib/username';
import { SPECIALTY_KEYS } from '@/lib/specialties';

export interface SettingsResult {
  ok: boolean;
  error?: string;
  field?: string;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'اكتب اسمك بالكامل').max(120),
  phone: z.string().trim().min(6, 'اكتب رقم هاتف صحيح').max(30),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
  yearsExperience: z.number().int().min(0).max(60),
  specialties: z
    .array(z.enum(SPECIALTY_KEYS as [Specialty, ...Specialty[]]))
    .min(1, 'اختار تخصص واحد على الأقل')
    .max(6, 'ستة تخصصات على الأكثر'),
  trainsGenders: z.enum(['MALE', 'FEMALE', 'BOTH']),
  instagram: z.string().trim().max(200).optional().or(z.literal('')),
  tiktok: z.string().trim().max(200).optional().or(z.literal('')),
  youtube: z.string().trim().max(200).optional().or(z.literal('')),
  whatsapp: z.string().trim().max(40).optional().or(z.literal('')),
});

export type ProfileInput = z.input<typeof profileSchema>;

/**
 * Editing the coach's own profile.
 *
 * These are the fields visitors filter and judge on in the public directory,
 * so a change here has to refresh the denormalised counters — `startingPrice`
 * and the rest are written when something happens, never aggregated at read
 * time, and specialties feed the same index.
 */
export async function updateProfile(input: ProfileInput): Promise<SettingsResult> {
  try {
    const user = await requireTrainer();
    const data = profileSchema.parse(input);

    const before = await prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { fullName: true, specialties: true, yearsExperience: true },
    });

    await prisma.trainerProfile.update({
      where: { id: user.trainerId },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        city: data.city || null,
        bio: data.bio || null,
        yearsExperience: data.yearsExperience,
        specialties: data.specialties,
        trainsGenders: data.trainsGenders,
        socialLinks: {
          instagram: data.instagram || null,
          tiktok: data.tiktok || null,
          youtube: data.youtube || null,
          whatsapp: data.whatsapp || null,
        },
      },
    });

    await syncDirectoryCounters(user.trainerId).catch(() => undefined);

    await audit({
      actorId: user.id,
      action: 'trainer.profile_updated',
      entity: 'TrainerProfile',
      entityId: user.trainerId,
      before,
      after: { fullName: data.fullName, specialties: data.specialties },
    });

    revalidatePath('/[locale]/dash/settings', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return { ok: false, error: issue?.message ?? 'بيانات غير صالحة', field: String(issue?.path[0] ?? '') };
    }
    return toActionError(error) as SettingsResult;
  }
}

/** Replaces the coach's avatar. */
export async function updateAvatar(formData: FormData): Promise<SettingsResult> {
  try {
    const user = await requireTrainer();

    const file = formData.get('avatar');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'اختار صورة الأول' };
    }

    const stored = await uploadFile(file, `avatars/${user.trainerId}`, 'image');

    await prisma.trainerProfile.update({
      where: { id: user.trainerId },
      data: { avatarUrl: stored.url },
    });

    revalidatePath('/[locale]/dash/settings', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as SettingsResult;
  }
}

/**
 * Changing the public handle.
 *
 * Rate-limited to once a month, and for a reason the coach can feel: the
 * handle is the URL they have printed on a card and shared on Instagram, and
 * every change breaks whatever already points at the old one. The cooldown is
 * a guard rail, not bureaucracy.
 */
export async function changeUsername(input: { username: string }): Promise<SettingsResult> {
  try {
    const user = await requireTrainer();
    const parsed = usernameSchema.safeParse(input.username);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message, field: 'username' };
    }

    const profile = await prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { username: true, usernameChangedAt: true },
    });
    if (!profile) return { ok: false, error: 'الحساب غير موجود' };

    if (profile.username === parsed.data) return { ok: true };

    if (profile.usernameChangedAt) {
      const since = Date.now() - profile.usernameChangedAt.getTime();
      const cooldown = USERNAME_CHANGE_COOLDOWN_DAYS * 864e5;
      if (since < cooldown) {
        const days = Math.ceil((cooldown - since) / 864e5);
        return {
          ok: false,
          field: 'username',
          error: `تقدر تغيّر اسم المستخدم مرة كل ${USERNAME_CHANGE_COOLDOWN_DAYS} يوم. فاضل ${days} يوم.`,
        };
      }
    }

    if (!(await isUsernameAvailable(parsed.data, user.trainerId))) {
      return { ok: false, error: 'اسم المستخدم غير متاح', field: 'username' };
    }

    await prisma.trainerProfile.update({
      where: { id: user.trainerId },
      data: { username: parsed.data, usernameChangedAt: new Date() },
    });

    await audit({
      actorId: user.id,
      action: 'trainer.username_changed',
      entity: 'TrainerProfile',
      entityId: user.trainerId,
      before: { username: profile.username },
      after: { username: parsed.data },
    });

    revalidatePath('/[locale]/dash/settings', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as SettingsResult;
  }
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'اكتب كلمة السر الحالية'),
    newPassword: z.string().min(8, 'كلمة السر الجديدة لازم 8 حروف على الأقل').max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

/**
 * Changing the password from inside the account.
 *
 * The current password is required even though the session already proves who
 * they are: a session can be a laptop left open in a gym, and "knows the old
 * password" is the check that stops a passer-by locking the owner out.
 */
export async function changePassword(
  input: z.input<typeof passwordSchema>,
): Promise<SettingsResult> {
  try {
    const user = await requireTrainer();
    const data = passwordSchema.parse(input);

    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!account) return { ok: false, error: 'الحساب غير موجود' };

    if (!(await verifyPassword(data.currentPassword, account.passwordHash))) {
      return { ok: false, error: 'كلمة السر الحالية غير صحيحة', field: 'currentPassword' };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });

    // Any outstanding reset link is burned: somebody who requested one and
    // then remembered their password should not leave a live key behind.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await audit({
      actorId: user.id,
      action: 'password.changed',
      entity: 'User',
      entityId: user.id,
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return { ok: false, error: issue?.message ?? 'بيانات غير صالحة', field: String(issue?.path[0] ?? '') };
    }
    return toActionError(error) as SettingsResult;
  }
}

/** Whether the coach appears in the public directory at all. */
export async function setDirectoryListing(isListed: boolean): Promise<SettingsResult> {
  try {
    const user = await requireTrainer();
    await prisma.trainerProfile.update({
      where: { id: user.trainerId },
      data: { isListed },
    });

    await audit({
      actorId: user.id,
      action: 'trainer.listing_changed',
      entity: 'TrainerProfile',
      entityId: user.trainerId,
      after: { isListed },
    });

    revalidatePath('/[locale]/dash/settings', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as SettingsResult;
  }
}

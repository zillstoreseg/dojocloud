'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { audit, notify } from '@/lib/audit';
import { usernameSchema, isUsernameAvailable, suggestUsername } from '@/lib/username';
import { uploadFile, UploadError } from '@/lib/storage';
import { getSetting } from '@/lib/settings';
import { toActionError } from '@/lib/authz';
import { countryLabel } from '@/lib/countries';
import { registerSchema, type RegisterInput } from './schema';

export interface RegisterResult {
  ok: boolean;
  error?: string;
  field?: string;
  trainerId?: string;
}

/** Live availability check for the username field. */
export async function checkUsername(
  raw: string,
): Promise<{ available: boolean; error?: string; suggestion?: string }> {
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    return { available: false, error: parsed.error.issues[0]?.message };
  }
  const available = await isUsernameAvailable(parsed.data);
  if (available) return { available: true };
  return { available: false, error: 'اسم المستخدم غير متاح', suggestion: await suggestUsername(parsed.data) };
}

export async function registerTrainer(input: RegisterInput): Promise<RegisterResult> {
  try {
    if ((await getSetting('app.allow_trainer_signup')) === 'false') {
      return { ok: false, error: 'التسجيل متوقف مؤقتًا، حاول لاحقًا' };
    }

    const data = registerSchema.parse(input);

    const [emailTaken, usernameFree] = await Promise.all([
      prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
      isUsernameAvailable(data.username),
    ]);
    if (emailTaken) return { ok: false, error: 'هذا البريد مسجّل بالفعل', field: 'email' };
    if (!usernameFree) return { ok: false, error: 'اسم المستخدم غير متاح', field: 'username' };

    const passwordHash = await hashPassword(data.password);

    // The account and profile are created together; the trainer then lands on
    // the certificate step, and stays PENDING until an admin approves.
    const trainer = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          passwordHash,
          role: 'TRAINER',
          status: 'ACTIVE',
          locale: 'ar',
        },
      });

      return tx.trainerProfile.create({
        data: {
          userId: user.id,
          username: data.username,
          fullName: data.fullName,
          specialties: data.specialties,
          phone: data.phone,
          country: data.country,
          city: data.city || null,
          gender: data.gender,
          trainsGenders: data.trainsGenders,
          yearsExperience: data.yearsExperience,
          bio: data.bio || null,
          approvalStatus: 'PENDING',
        },
      });
    });

    await audit({
      actorId: trainer.userId,
      action: 'trainer.register',
      entity: 'TrainerProfile',
      entityId: trainer.id,
      after: { username: data.username, country: data.country },
    });

    // Tell the admins there is something new to review.
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        notify({
          userId: admin.id,
          type: 'SYSTEM',
          titleAr: 'طلب اعتماد مدرب جديد',
          titleEn: 'New trainer awaiting approval',
          bodyAr: `${data.fullName} — ${countryLabel(data.country, 'ar')}`,
          bodyEn: `${data.fullName} — ${countryLabel(data.country, 'en')}`,
          link: '/admin/activations',
        }),
      ),
    );

    return { ok: true, trainerId: trainer.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return { ok: false, error: issue?.message ?? 'بيانات غير صالحة', field: String(issue?.path[0] ?? '') };
    }
    return toActionError(error) as RegisterResult;
  }
}

const certificateSchema = z.object({
  title: z.string().trim().min(2, 'اكتب اسم الشهادة').max(160),
  issuer: z.string().trim().max(160).optional().or(z.literal('')),
  year: z.number().int().min(1950).max(new Date().getFullYear()).nullable().optional(),
});

/**
 * Uploads one certificate for the signed-in trainer. Called once per file so a
 * single oversized upload doesn't fail the whole batch.
 */
export async function uploadCertificate(formData: FormData): Promise<RegisterResult> {
  try {
    const { requireTrainer } = await import('@/lib/authz');
    const user = await requireTrainer();

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'اختر ملف الشهادة', field: 'file' };
    }

    const meta = certificateSchema.parse({
      title: String(formData.get('title') ?? ''),
      issuer: String(formData.get('issuer') ?? ''),
      year: formData.get('year') ? Number(formData.get('year')) : null,
    });

    const stored = await uploadFile(file, `certificates/${user.trainerId}`, 'document');

    await prisma.certificate.create({
      data: {
        trainerId: user.trainerId,
        title: meta.title,
        issuer: meta.issuer || null,
        year: meta.year ?? null,
        fileUrl: stored.url,
        fileType: stored.contentType,
        status: 'PENDING',
      },
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message, field: 'file' };
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return { ok: false, error: issue?.message ?? 'بيانات غير صالحة', field: String(issue?.path[0] ?? '') };
    }
    return toActionError(error) as RegisterResult;
  }
}

export async function deleteCertificate(input: { id: string }): Promise<RegisterResult> {
  try {
    const { requireTrainer } = await import('@/lib/authz');
    const user = await requireTrainer();

    // Scoped delete: a trainer can only remove their own certificate.
    const result = await prisma.certificate.deleteMany({
      where: { id: input.id, trainerId: user.trainerId, status: 'PENDING' },
    });
    if (result.count === 0) return { ok: false, error: 'لا يمكن حذف هذه الشهادة' };

    return { ok: true };
  } catch (error) {
    return toActionError(error) as RegisterResult;
  }
}

/** Re-submits a rejected profile for another review. */
export async function resubmitForReview(): Promise<RegisterResult> {
  try {
    const { requireTrainer } = await import('@/lib/authz');
    const user = await requireTrainer();

    const trainer = await prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { approvalStatus: true, _count: { select: { certificates: true } } },
    });
    if (!trainer) return { ok: false, error: 'الملف غير موجود' };
    if (trainer.approvalStatus === 'APPROVED') return { ok: false, error: 'حسابك معتمد بالفعل' };
    if (trainer._count.certificates === 0) {
      return { ok: false, error: 'ارفع شهادة واحدة على الأقل قبل إعادة الإرسال' };
    }

    await prisma.trainerProfile.update({
      where: { id: user.trainerId },
      data: { approvalStatus: 'PENDING', rejectionReason: null },
    });
    await prisma.certificate.updateMany({
      where: { trainerId: user.trainerId, status: 'REJECTED' },
      data: { status: 'PENDING', reviewNote: null },
    });

    await audit({
      actorId: user.id,
      action: 'trainer.resubmit',
      entity: 'TrainerProfile',
      entityId: user.trainerId,
    });

    return { ok: true };
  } catch (error) {
    return toActionError(error) as RegisterResult;
  }
}

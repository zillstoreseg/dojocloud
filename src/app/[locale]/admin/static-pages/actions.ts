'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, toActionError } from '@/lib/authz';
import { audit } from '@/lib/audit';

export interface PageResult {
  ok: boolean;
  error?: string;
}

const pageSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'الرابط يقبل حروف إنجليزية صغيرة وأرقام وشرطة فقط'),
  titleAr: z.string().trim().min(2, 'اكتب العنوان بالعربية').max(160),
  titleEn: z.string().trim().min(2, 'Write the English title').max(160),
  contentAr: z.string().trim().min(10, 'المحتوى قصير أوي').max(60000),
  contentEn: z.string().trim().min(10, 'The English content is too short').max(60000),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']),
});

export type StaticPageInput = z.input<typeof pageSchema>;

/**
 * Creates or updates one of the platform's own pages.
 *
 * `revalidatePath` matters here more than usual: the public route caches for
 * five minutes, and an owner correcting their terms expects the correction to
 * be live rather than to wait out a window they cannot see.
 */
export async function saveStaticPage(input: StaticPageInput): Promise<PageResult> {
  try {
    const admin = await requireAdmin('content.write');
    const data = pageSchema.parse(input);

    const before = await prisma.staticPage.findUnique({
      where: { slug: data.slug },
      select: { titleAr: true, status: true },
    });

    await prisma.staticPage.upsert({
      where: { slug: data.slug },
      create: data,
      update: {
        titleAr: data.titleAr,
        titleEn: data.titleEn,
        contentAr: data.contentAr,
        contentEn: data.contentEn,
        status: data.status,
      },
    });

    await audit({
      actorId: admin.id,
      action: before ? 'staticPage.update' : 'staticPage.create',
      entity: 'StaticPage',
      entityId: data.slug,
      before,
      after: { titleAr: data.titleAr, status: data.status },
    });

    revalidatePath(`/[locale]/p/${data.slug}`, 'page');
    revalidatePath('/[locale]/admin/static-pages', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as PageResult;
  }
}

/**
 * Deletes a page.
 *
 * Terms and privacy are refused: they are linked from the public footer and
 * referenced by the account a visitor creates, and a platform that collects
 * health data with no published policy is a problem no admin should be one
 * click away from creating. Hiding them is still possible; deleting is not.
 */
export async function deleteStaticPage(slug: string): Promise<PageResult> {
  try {
    const admin = await requireAdmin('content.write');

    if (slug === 'terms' || slug === 'privacy') {
      return {
        ok: false,
        error: 'الشروط وسياسة الخصوصية مالهمش حذف — تقدر تخفيها بس.',
      };
    }

    await prisma.staticPage.delete({ where: { slug } });

    await audit({
      actorId: admin.id,
      action: 'staticPage.delete',
      entity: 'StaticPage',
      entityId: slug,
    });

    revalidatePath('/[locale]/admin/static-pages', 'page');
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PageResult;
  }
}

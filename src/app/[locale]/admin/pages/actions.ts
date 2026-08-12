'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, toActionError } from '@/lib/authz';
import { audit, notify } from '@/lib/audit';

export interface PageModerationResult {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  id: z.string().min(1),
  archive: z.boolean(),
  reason: z.string().trim().max(500),
});

/**
 * Takes a coach's public page offline, or puts it back.
 *
 * Archiving is deliberately not a delete: the coach's work is preserved, so
 * fixing whatever was wrong and republishing does not mean rebuilding the page.
 */
export async function setPageModeration(
  input: z.input<typeof schema>,
): Promise<PageModerationResult> {
  try {
    const admin = await requireAdmin('pages.write');
    const data = schema.parse(input);

    if (data.archive && data.reason.length < 3) {
      return { ok: false, error: 'اكتب سبب الإخفاء' };
    }

    const page = await prisma.landingPage.findUnique({
      where: { id: data.id },
      select: { id: true, status: true, title: true, trainer: { select: { userId: true } } },
    });
    if (!page) return { ok: false, error: 'الصفحة غير موجودة' };

    const next = data.archive ? 'HIDDEN' : 'DRAFT';

    await prisma.landingPage.update({
      where: { id: page.id },
      data: { status: next, publishedAt: null },
    });

    await audit({
      actorId: admin.id,
      action: data.archive ? 'page.archive' : 'page.restore',
      entity: 'LandingPage',
      entityId: page.id,
      before: { status: page.status },
      after: { status: next, reason: data.reason || null },
    });

    await notify({
      userId: page.trainer.userId,
      type: 'SYSTEM',
      titleAr: data.archive ? 'اتأخفت صفحتك' : 'رجعت صفحتك',
      titleEn: data.archive ? 'Your page was hidden' : 'Your page was restored',
      bodyAr: data.archive
        ? `صفحة «${page.title}» اتأخفت: ${data.reason}`
        : `تقدر تنشر صفحة «${page.title}» تاني.`,
      bodyEn: data.archive
        ? `“${page.title}” was hidden: ${data.reason}`
        : `You can publish “${page.title}” again.`,
      link: '/dash/page',
    });

    revalidatePath('/[locale]/admin/pages', 'page');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: 'بيانات غير صالحة' };
    return toActionError(error) as PageModerationResult;
  }
}

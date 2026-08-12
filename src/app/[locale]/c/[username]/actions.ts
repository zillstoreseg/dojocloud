'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/audit';

/**
 * The one write a signed-out visitor can make.
 *
 * Everything here assumes the caller is hostile: the trainer is addressed by
 * public username and resolved server-side, the page id is verified to belong
 * to that trainer, and submissions are rate-limited per IP so the form cannot
 * be used to flood a coach's inbox.
 */

export interface LeadResult {
  ok: boolean;
  error?: string;
}

const leadSchema = z.object({
  username: z.string().trim().min(1).max(40),
  pageId: z.string().nullable().optional(),
  name: z.string().trim().min(2, 'اكتب اسمك').max(120),
  phone: z.string().trim().min(6, 'اكتب رقم صحيح').max(30),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  goal: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().max(1000).optional().or(z.literal('')),
});

const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

/**
 * In-memory limiter. Deliberately per-instance: it is a speed bump against a
 * casual flood, not a security boundary, and it costs no round trip. A real
 * distributed limit belongs at the edge.
 */
const recent = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > RATE_LIMIT.max;
}

export async function submitLead(input: z.input<typeof leadSchema>): Promise<LeadResult> {
  try {
    const data = leadSchema.parse(input);

    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'local';
    if (rateLimited(`${ip}|${data.username}`)) {
      return { ok: false, error: 'حاولت كتير في وقت قصير، استنى شوية وجرّب تاني' };
    }

    const trainer = await prisma.trainerProfile.findFirst({
      where: { username: data.username.toLowerCase(), approvalStatus: 'APPROVED' },
      select: { id: true, userId: true },
    });
    if (!trainer) return { ok: false, error: 'المدرب غير متاح' };

    // A page id from the client is only trusted after it is shown to belong to
    // this trainer; otherwise the lead is filed against the trainer alone.
    let pageId: string | null = null;
    if (data.pageId) {
      const page = await prisma.landingPage.findFirst({
        where: { id: data.pageId, trainerId: trainer.id },
        select: { id: true },
      });
      pageId = page?.id ?? null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.lead.create({
        data: {
          trainerId: trainer.id,
          pageId,
          name: data.name,
          phone: data.phone,
          email: data.email || null,
          goal: data.goal || null,
          message: data.message || null,
          source: pageId ? 'landing' : 'profile',
          utmSource: h.get('referer')?.slice(0, 120) ?? null,
        },
      });
      if (pageId) {
        await tx.landingPage.update({
          where: { id: pageId },
          data: { leadsCount: { increment: 1 } },
        });
      }
    });

    await notify({
      userId: trainer.userId,
      type: 'NEW_LEAD',
      titleAr: 'عميل محتمل جديد',
      titleEn: 'New lead',
      bodyAr: `${data.name} ساب رقمه من صفحتك.`,
      bodyEn: `${data.name} left their number on your page.`,
      link: '/dash/leads',
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return { ok: false, error: 'حصل خطأ، جرّب تاني' };
  }
}

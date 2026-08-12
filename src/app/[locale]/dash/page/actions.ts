'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { BlockType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTrainer, assertOwns, toActionError, AuthzError } from '@/lib/authz';
import { assertQuota, QUOTA_KEYS, QuotaExceededError } from '@/lib/quota';
import { isFeatureEnabled } from '@/lib/flags';
import {
  BLOCK_DEFAULTS,
  blockSchemas,
  pageThemeSchema,
  starterBlocks,
  FLAGGED_BLOCKS,
} from '@/lib/page-blocks';

export interface PageActionResult {
  ok: boolean;
  error?: string;
  upgrade?: boolean;
  pageId?: string;
}

/** Blocks live under a page, so ownership is checked one level up. */
async function assertOwnsBlock(trainerId: string, blockId: string): Promise<string> {
  const block = await prisma.pageBlock.findFirst({
    where: { id: blockId, page: { trainerId } },
    select: { id: true },
  });
  if (!block) throw new AuthzError('Block not found for this trainer', 'NOT_FOUND');
  return block.id;
}

function refresh() {
  revalidatePath('/[locale]/dash/page', 'page');
}

/**
 * Returns the trainer's page, creating a starter one on first open.
 *
 * A blank canvas is a worse first run than a page that already says something
 * true about the coach, so the starter carries their name and experience.
 */
export async function ensurePage(isAr: boolean): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();

    const existing = await prisma.landingPage.findFirst({
      where: { trainerId: user.trainerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (existing) return { ok: true, pageId: existing.id };

    await assertQuota(user.trainerId, QUOTA_KEYS.LANDING_PAGES);

    const profile = await prisma.trainerProfile.findUniqueOrThrow({
      where: { id: user.trainerId },
      select: { fullName: true, yearsExperience: true },
    });

    const page = await prisma.landingPage.create({
      data: {
        trainerId: user.trainerId,
        title: profile.fullName,
        isDefault: true,
        blocks: {
          create: starterBlocks({ ...profile, isAr }).map((block, order) => ({
            type: block.type,
            order,
            props: block.props as never,
          })),
        },
      },
      select: { id: true },
    });

    refresh();
    return { ok: true, pageId: page.id };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return { ok: false, upgrade: true, error: `خطتك بتسمح بـ${error.limit} صفحة.` };
    }
    return toActionError(error) as PageActionResult;
  }
}

export async function addBlock(input: {
  pageId: string;
  type: BlockType;
}): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwns('landingPage', user.trainerId, input.pageId);

    // Some blocks are sold with a plan; the builder hides them, and this is the
    // check that makes hiding them mean something.
    const flag = FLAGGED_BLOCKS[input.type];
    if (flag && !(await isFeatureEnabled(user.id, flag))) {
      return { ok: false, upgrade: true, error: 'البلوك ده متاح في خطة أعلى.' };
    }

    const last = await prisma.pageBlock.findFirst({
      where: { pageId: input.pageId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    await prisma.pageBlock.create({
      data: {
        pageId: input.pageId,
        type: input.type,
        order: (last?.order ?? -1) + 1,
        props: BLOCK_DEFAULTS[input.type] as never,
      },
    });

    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PageActionResult;
  }
}

export async function updateBlockProps(input: {
  id: string;
  props: Record<string, unknown>;
}): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsBlock(user.trainerId, input.id);

    const block = await prisma.pageBlock.findUniqueOrThrow({
      where: { id: input.id },
      select: { type: true, props: true },
    });

    // Validated against the block's own schema, so a malformed patch is
    // rejected here rather than at render time on a public page.
    const merged = { ...(block.props as object), ...input.props };
    const parsed = blockSchemas[block.type].safeParse(merged);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'قيمة غير صالحة' };
    }

    await prisma.pageBlock.update({
      where: { id: input.id },
      data: { props: parsed.data as never },
    });

    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PageActionResult;
  }
}

export async function toggleBlock(input: {
  id: string;
  isVisible: boolean;
}): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsBlock(user.trainerId, input.id);
    await prisma.pageBlock.update({
      where: { id: input.id },
      data: { isVisible: input.isVisible },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PageActionResult;
  }
}

export async function deleteBlock(input: { id: string }): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwnsBlock(user.trainerId, input.id);
    await prisma.pageBlock.delete({ where: { id: input.id } });
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PageActionResult;
  }
}

export async function reorderBlocks(input: {
  pageId: string;
  blockIds: string[];
}): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwns('landingPage', user.trainerId, input.pageId);

    await prisma.$transaction(
      input.blockIds.map((id, order) =>
        // Scoped to the page as well as the id: an id from another page cannot
        // be dragged into this one's ordering.
        prisma.pageBlock.updateMany({ where: { id, pageId: input.pageId }, data: { order } }),
      ),
    );

    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PageActionResult;
  }
}

const settingsSchema = z.object({
  pageId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  seoTitle: z.string().trim().max(80).optional().or(z.literal('')),
  seoDescription: z.string().trim().max(200).optional().or(z.literal('')),
  theme: pageThemeSchema,
});

export async function updatePageSettings(
  input: z.input<typeof settingsSchema>,
): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();
    const data = settingsSchema.parse(input);
    await assertOwns('landingPage', user.trainerId, data.pageId);

    await prisma.landingPage.update({
      where: { id: data.pageId },
      data: {
        title: data.title,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        theme: data.theme as never,
      },
    });

    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    return toActionError(error) as PageActionResult;
  }
}

export async function setPageStatus(input: {
  pageId: string;
  publish: boolean;
}): Promise<PageActionResult> {
  try {
    const user = await requireTrainer();
    await assertOwns('landingPage', user.trainerId, input.pageId);

    if (input.publish) {
      const visible = await prisma.pageBlock.count({
        where: { pageId: input.pageId, isVisible: true },
      });
      if (visible === 0) {
        return { ok: false, error: 'ضيف بلوك واحد على الأقل قبل النشر.' };
      }
    }

    await prisma.landingPage.update({
      where: { id: input.pageId },
      data: {
        status: input.publish ? 'PUBLISHED' : 'DRAFT',
        publishedAt: input.publish ? new Date() : null,
      },
    });

    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error) as PageActionResult;
  }
}

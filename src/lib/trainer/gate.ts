import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUserPage, type SessionUser } from '@/lib/authz';
import { resolveTrainerStage, stageHref, type GateFacts, type TrainerStage } from './stage';

export { resolveTrainerStage, stageHref };
export type { GateFacts, TrainerStage };

/** Reads the facts this trainer's stage depends on. */
export async function trainerFacts(user: SessionUser): Promise<GateFacts> {
  if (user.role !== 'TRAINER' || !user.trainerId) {
    return { role: user.role, trainerId: null, approvalStatus: null, subscription: null };
  }

  const [profile, subscription] = await Promise.all([
    prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { approvalStatus: true },
    }),
    // The most recent subscription governs access; older rows are history.
    prisma.subscription.findFirst({
      where: { trainerId: user.trainerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        payments: { where: { status: 'PENDING' }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  return {
    role: user.role,
    trainerId: user.trainerId,
    approvalStatus: profile?.approvalStatus ?? null,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          hasPendingPayment: subscription.payments.length > 0,
        }
      : null,
  };
}

/**
 * Guard for the trainer dashboard: sends an unfinished trainer to the one
 * screen that can move them forward, and returns the session user otherwise.
 *
 * `except` lets an onboarding screen call the same guard without bouncing
 * itself — the plan picker tolerates the `needs-plan` stage, and so on.
 */
export async function requireTrainerStage(
  locale: string,
  except: TrainerStage['stage'][] = [],
): Promise<{ user: SessionUser & { trainerId: string }; stage: TrainerStage }> {
  const user = await requireUserPage(locale);
  const stage = resolveTrainerStage(await trainerFacts(user));

  if (stage.stage === 'not-a-trainer') notFound();

  if (!except.includes(stage.stage)) {
    const href = stageHref(stage, locale);
    if (href) redirect(href);
  }

  return { user: user as SessionUser & { trainerId: string }, stage };
}

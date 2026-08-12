/**
 * Where a trainer belongs right now, as pure data.
 *
 * The dashboard is only reachable once an account is approved *and* paid for,
 * and every intermediate state has exactly one screen that can move it
 * forward. This module deliberately imports nothing — no Prisma, no auth — so
 * every branch can be tested directly, and so the rule cannot quietly diverge
 * between the layout that enforces it and the screens that satisfy it.
 */
export type TrainerStage =
  | { stage: 'not-a-trainer' }
  | { stage: 'pending-approval' }
  | { stage: 'needs-plan' }
  | { stage: 'needs-payment'; subscriptionId: string }
  | { stage: 'payment-in-review'; subscriptionId: string }
  | { stage: 'ready' };

export interface GateFacts {
  role: string;
  trainerId: string | null | undefined;
  approvalStatus: string | null | undefined;
  subscription:
    | {
        id: string;
        status: string;
        /** Whether a receipt is already sitting with an admin. */
        hasPendingPayment: boolean;
      }
    | null;
}

export function resolveTrainerStage(facts: GateFacts): TrainerStage {
  if (facts.role !== 'TRAINER' || !facts.trainerId) return { stage: 'not-a-trainer' };

  // Approval is checked before money: an unapproved trainer must never be
  // asked to pay for an account that might be rejected.
  if (facts.approvalStatus !== 'APPROVED') return { stage: 'pending-approval' };

  const sub = facts.subscription;
  if (!sub) return { stage: 'needs-plan' };

  if (sub.status === 'ACTIVE' || sub.status === 'TRIALING') return { stage: 'ready' };

  if (sub.status === 'PENDING_PAYMENT') {
    // A receipt already under review gets its own screen, so nobody is asked
    // to pay twice while an admin is looking at their transfer.
    return sub.hasPendingPayment
      ? { stage: 'payment-in-review', subscriptionId: sub.id }
      : { stage: 'needs-payment', subscriptionId: sub.id };
  }

  // EXPIRED / CANCELED / SUSPENDED: start again from plan selection.
  return { stage: 'needs-plan' };
}

/** Maps a stage to the one route that can advance it. */
export function stageHref(stage: TrainerStage, locale: string): string | null {
  switch (stage.stage) {
    case 'pending-approval':
      return `/${locale}/onboarding/pending`;
    case 'needs-plan':
      return `/${locale}/onboarding/plan`;
    case 'needs-payment':
      return `/${locale}/onboarding/plan/${stage.subscriptionId}/pay`;
    case 'payment-in-review':
      return `/${locale}/onboarding/plan/${stage.subscriptionId}/review`;
    default:
      return null;
  }
}

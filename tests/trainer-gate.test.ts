import { describe, expect, it } from 'vitest';
// Imported from `stage` rather than `gate`: the decision logic is deliberately
// free of Prisma and next-auth so it can be exercised directly.
import { resolveTrainerStage, stageHref, type GateFacts } from '@/lib/trainer/stage';

const facts = (overrides: Partial<GateFacts> = {}): GateFacts => ({
  role: 'TRAINER',
  trainerId: 'trainer_1',
  approvalStatus: 'APPROVED',
  subscription: null,
  ...overrides,
});

describe('resolveTrainerStage', () => {
  it('rejects anyone who is not a trainer', () => {
    expect(resolveTrainerStage(facts({ role: 'ADMIN' })).stage).toBe('not-a-trainer');
    expect(resolveTrainerStage(facts({ role: 'TRAINEE' })).stage).toBe('not-a-trainer');
    // A TRAINER row with no profile is a broken account, not a usable one.
    expect(resolveTrainerStage(facts({ trainerId: null })).stage).toBe('not-a-trainer');
  });

  it('holds an unapproved trainer at the pending screen', () => {
    expect(resolveTrainerStage(facts({ approvalStatus: 'PENDING' })).stage).toBe('pending-approval');
    expect(resolveTrainerStage(facts({ approvalStatus: 'REJECTED' })).stage).toBe(
      'pending-approval',
    );
  });

  it('sends an approved trainer with no subscription to pick a plan', () => {
    expect(resolveTrainerStage(facts()).stage).toBe('needs-plan');
  });

  it('opens the dashboard for an active or trialing subscription', () => {
    for (const status of ['ACTIVE', 'TRIALING']) {
      const stage = resolveTrainerStage(
        facts({ subscription: { id: 'sub_1', status, hasPendingPayment: false } }),
      );
      expect(stage.stage, status).toBe('ready');
    }
  });

  it('separates "needs to pay" from "already paid, awaiting review"', () => {
    const unpaid = resolveTrainerStage(
      facts({ subscription: { id: 'sub_1', status: 'PENDING_PAYMENT', hasPendingPayment: false } }),
    );
    expect(unpaid).toEqual({ stage: 'needs-payment', subscriptionId: 'sub_1' });

    // Someone whose receipt is with an admin must never be asked to pay again.
    const submitted = resolveTrainerStage(
      facts({ subscription: { id: 'sub_1', status: 'PENDING_PAYMENT', hasPendingPayment: true } }),
    );
    expect(submitted).toEqual({ stage: 'payment-in-review', subscriptionId: 'sub_1' });
  });

  it('sends an expired or canceled subscription back to plan selection', () => {
    for (const status of ['EXPIRED', 'CANCELED', 'SUSPENDED']) {
      const stage = resolveTrainerStage(
        facts({ subscription: { id: 'sub_1', status, hasPendingPayment: false } }),
      );
      expect(stage.stage, status).toBe('needs-plan');
    }
  });

  it('checks approval before payment, so an unapproved trainer is never asked for money', () => {
    const stage = resolveTrainerStage(
      facts({
        approvalStatus: 'PENDING',
        subscription: { id: 'sub_1', status: 'PENDING_PAYMENT', hasPendingPayment: false },
      }),
    );
    expect(stage.stage).toBe('pending-approval');
  });
});

describe('stageHref', () => {
  it('gives every blocked stage exactly one way forward', () => {
    expect(stageHref({ stage: 'pending-approval' }, 'ar')).toBe('/ar/onboarding/pending');
    expect(stageHref({ stage: 'needs-plan' }, 'ar')).toBe('/ar/onboarding/plan');
    expect(stageHref({ stage: 'needs-payment', subscriptionId: 's1' }, 'en')).toBe(
      '/en/onboarding/plan/s1/pay',
    );
    expect(stageHref({ stage: 'payment-in-review', subscriptionId: 's1' }, 'en')).toBe(
      '/en/onboarding/plan/s1/review',
    );
  });

  it('returns null for a stage that needs no redirect', () => {
    expect(stageHref({ stage: 'ready' }, 'ar')).toBeNull();
    expect(stageHref({ stage: 'not-a-trainer' }, 'ar')).toBeNull();
  });
});

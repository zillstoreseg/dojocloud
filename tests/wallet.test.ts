import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  ensureWallet,
  creditTraineePayment,
  releaseMatured,
  requestPayout,
  markPayoutPaid,
  rejectPayout,
  adjust,
  walletInvariant,
  payoutLimits,
  WalletError,
} from '@/lib/wallet';

/**
 * The wallet is the only part of the product that holds other people's money,
 * so these run against the real database and assert the ledger invariant after
 * every operation: what the wallet says it holds always equals the sum of its
 * entries. A wallet that drifts is a coach who is owed the wrong amount.
 */

const TAG = `wallet-${Date.now()}`;
let userId: string;
let trainerId: string;
let walletId: string;

async function invariantHolds() {
  const state = await walletInvariant(walletId);
  expect(state.drift.toString(), 'ledger and cached balances disagree').toBe('0');
  return state;
}

beforeAll(async () => {
  // The hold window and limits are read from settings, so pin them.
  await prisma.appSetting.createMany({
    data: [
      { key: 'payout.hold_days', value: '7', category: 'payout' },
      { key: 'payout.min_amount', value: '500', category: 'payout' },
      { key: 'payout.max_per_request', value: '20000', category: 'payout' },
      { key: 'payout.max_per_month', value: '50000', category: 'payout' },
      { key: 'payout.enabled', value: 'true', category: 'payout' },
    ],
    skipDuplicates: true,
  });

  const user = await prisma.user.create({
    data: { email: `${TAG}@example.test`, passwordHash: 'x', role: 'TRAINER' },
  });
  userId = user.id;

  const trainer = await prisma.trainerProfile.create({
    data: {
      userId: user.id,
      username: TAG,
      fullName: 'Wallet Coach',
      specialties: ['MUSCLE_GAIN'],
      phone: '+201000000000',
      country: 'EG',
      gender: 'MALE',
      trainsGenders: 'BOTH',
      yearsExperience: 3,
      approvalStatus: 'APPROVED',
    },
  });
  trainerId = trainer.id;
});

beforeEach(async () => {
  // Each test starts from an empty ledger so amounts are readable.
  await prisma.payoutRequest.deleteMany({ where: { wallet: { trainerId } } });
  await prisma.walletTransaction.deleteMany({ where: { wallet: { trainerId } } });
  await prisma.wallet.deleteMany({ where: { trainerId } });
  const wallet = await ensureWallet(trainerId);
  walletId = wallet.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('crediting a trainee payment', () => {
  it('puts the net in pending and books the commission separately', async () => {
    const result = await creditTraineePayment({
      trainerId,
      subscriptionId: `sub-${TAG}-1`,
      amount: 1000,
      commission: 50,
      currency: 'EGP',
    });

    expect(result?.net.toString()).toBe('950');

    const state = await invariantHolds();
    expect(state.balance.toString()).toBe('0');
    expect(state.pendingBalance.toString()).toBe('950');

    const commission = await prisma.walletTransaction.findFirst({
      where: { walletId, type: 'COMMISSION_FEE' },
    });
    expect(commission?.amount.toString()).toBe('-50');
  });

  it('does not pay twice for the same subscription', async () => {
    const args = {
      trainerId,
      subscriptionId: `sub-${TAG}-dup`,
      amount: 1000,
      commission: 0,
      currency: 'EGP',
    };
    await creditTraineePayment(args);
    const second = await creditTraineePayment(args);

    expect(second).toBeNull();
    const state = await invariantHolds();
    expect(state.pendingBalance.toString()).toBe('1000');
  });

  it('sets the release date a hold window out', async () => {
    const { holdDays } = await payoutLimits();
    const result = await creditTraineePayment({
      trainerId,
      subscriptionId: `sub-${TAG}-hold`,
      amount: 500,
      commission: 0,
      currency: 'EGP',
    });
    const days = (result!.availableAt.getTime() - Date.now()) / 864e5;
    expect(Math.round(days)).toBe(holdDays);
  });
});

describe('releasing matured holds', () => {
  it('leaves an immature credit alone', async () => {
    await creditTraineePayment({
      trainerId,
      subscriptionId: `sub-${TAG}-young`,
      amount: 800,
      commission: 0,
      currency: 'EGP',
    });

    await releaseMatured(trainerId);
    const state = await invariantHolds();
    expect(state.balance.toString()).toBe('0');
    expect(state.pendingBalance.toString()).toBe('800');
  });

  it('moves a matured credit into the available balance', async () => {
    await creditTraineePayment({
      trainerId,
      subscriptionId: `sub-${TAG}-old`,
      amount: 800,
      commission: 0,
      currency: 'EGP',
    });
    // Backdate it past the hold window.
    await prisma.walletTransaction.updateMany({
      where: { walletId, type: 'CREDIT' },
      data: { availableAt: new Date(Date.now() - 864e5) },
    });

    await releaseMatured(trainerId);

    const state = await invariantHolds();
    expect(state.balance.toString()).toBe('800');
    expect(state.pendingBalance.toString()).toBe('0');
  });

  it('is safe to run twice', async () => {
    await creditTraineePayment({
      trainerId,
      subscriptionId: `sub-${TAG}-twice`,
      amount: 600,
      commission: 0,
      currency: 'EGP',
    });
    await prisma.walletTransaction.updateMany({
      where: { walletId, type: 'CREDIT' },
      data: { availableAt: new Date(Date.now() - 864e5) },
    });

    await releaseMatured(trainerId);
    await releaseMatured(trainerId);

    const state = await invariantHolds();
    expect(state.balance.toString()).toBe('600');
    expect(state.pendingBalance.toString()).toBe('0');
  });
});

/** Puts a known amount into the withdrawable balance. */
async function fundAvailable(amount: number, ref = 'fund') {
  await creditTraineePayment({
    trainerId,
    subscriptionId: `sub-${TAG}-${ref}-${Math.random()}`,
    amount,
    commission: 0,
    currency: 'EGP',
  });
  await prisma.walletTransaction.updateMany({
    where: { walletId, type: 'CREDIT', releasedAt: null },
    data: { availableAt: new Date(Date.now() - 864e5) },
  });
  await releaseMatured(trainerId);
}

describe('payout requests', () => {
  it('reserves the money immediately so it cannot be requested twice', async () => {
    await fundAvailable(5000);
    await requestPayout({ trainerId, amount: 2000, method: 'INSTAPAY', destination: 'enc' });

    const state = await invariantHolds();
    expect(state.balance.toString()).toBe('3000');
    expect(state.pendingBalance.toString()).toBe('2000');
  });

  it('refuses a second request while one is open', async () => {
    await fundAvailable(9000);
    await requestPayout({ trainerId, amount: 1000, method: 'BANK', destination: 'enc' });

    await expect(
      requestPayout({ trainerId, amount: 1000, method: 'BANK', destination: 'enc' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });

    await invariantHolds();
  });

  it('refuses more than the available balance', async () => {
    await fundAvailable(1000);
    await expect(
      requestPayout({ trainerId, amount: 2000, method: 'BANK', destination: 'enc' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT' });
    await invariantHolds();
  });

  it('enforces the minimum and the per-request cap', async () => {
    await fundAvailable(40000);
    await expect(
      requestPayout({ trainerId, amount: 100, method: 'BANK', destination: 'enc' }),
    ).rejects.toMatchObject({ code: 'BELOW_MIN' });
    await expect(
      requestPayout({ trainerId, amount: 30000, method: 'BANK', destination: 'enc' }),
    ).rejects.toMatchObject({ code: 'ABOVE_MAX' });
    await invariantHolds();
  });

  it('refuses when the wallet is frozen', async () => {
    await fundAvailable(5000);
    await prisma.wallet.update({ where: { id: walletId }, data: { isFrozen: true } });

    await expect(
      requestPayout({ trainerId, amount: 1000, method: 'BANK', destination: 'enc' }),
    ).rejects.toBeInstanceOf(WalletError);

    await prisma.wallet.update({ where: { id: walletId }, data: { isFrozen: false } });
  });
});

describe('resolving a payout', () => {
  it('takes the money out of the wallet when paid', async () => {
    await fundAvailable(5000);
    const request = await requestPayout({
      trainerId,
      amount: 2000,
      method: 'BANK',
      destination: 'enc',
    });

    await markPayoutPaid({ payoutId: request.id, adminId: 'admin-test', proofUrl: '/p.png' });

    const state = await invariantHolds();
    expect(state.balance.toString()).toBe('3000');
    expect(state.pendingBalance.toString()).toBe('0');

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    expect(wallet.lifetimeWithdrawn.toString()).toBe('2000');
  });

  it('gives the money back when rejected', async () => {
    await fundAvailable(5000);
    const request = await requestPayout({
      trainerId,
      amount: 2000,
      method: 'BANK',
      destination: 'enc',
    });

    await rejectPayout({ payoutId: request.id, adminId: 'admin-test', reason: 'بيانات ناقصة' });

    const state = await invariantHolds();
    expect(state.balance.toString()).toBe('5000');
    expect(state.pendingBalance.toString()).toBe('0');
  });

  it('will not resolve the same request twice', async () => {
    await fundAvailable(5000);
    const request = await requestPayout({
      trainerId,
      amount: 1000,
      method: 'BANK',
      destination: 'enc',
    });
    await markPayoutPaid({ payoutId: request.id, adminId: 'admin-test' });

    await expect(
      markPayoutPaid({ payoutId: request.id, adminId: 'admin-test' }),
    ).rejects.toBeInstanceOf(WalletError);
    await expect(
      rejectPayout({ payoutId: request.id, adminId: 'admin-test', reason: 'x' }),
    ).rejects.toBeInstanceOf(WalletError);

    await invariantHolds();
  });
});

describe('the ledger itself', () => {
  it('holds the invariant through a full lifecycle', async () => {
    await fundAvailable(3000, 'a');
    await creditTraineePayment({
      trainerId,
      subscriptionId: `sub-${TAG}-b`,
      amount: 1500,
      commission: 75,
      currency: 'EGP',
    });
    const request = await requestPayout({
      trainerId,
      amount: 1200,
      method: 'WISE',
      destination: 'enc',
    });
    await markPayoutPaid({ payoutId: request.id, adminId: 'admin-test' });
    await adjust({ trainerId, amount: -100, reason: 'تسوية اختبار', adminId: 'admin-test' });

    const state = await invariantHolds();
    // 3000 available − 1200 paid − 100 adjustment = 1700 available;
    // 1425 net of the second credit still on hold.
    expect(state.balance.toString()).toBe('1700');
    expect(state.pendingBalance.toString()).toBe('1425');
  });

  it('records a running balance on every entry', async () => {
    await fundAvailable(1000, 'snap');
    const rows = await prisma.walletTransaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'asc' },
    });
    const last = rows.at(-1)!;
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    expect(last.balanceAfter.toString()).toBe(wallet.balance.toString());
    expect(last.pendingBalanceAfter.toString()).toBe(wallet.pendingBalance.toString());
  });

  it('never rewrites what an entry says happened', async () => {
    await fundAvailable(1000, 'immutable');
    const credit = await prisma.walletTransaction.findFirstOrThrow({
      where: { walletId, type: 'CREDIT' },
    });
    // `releasedAt` is a lifecycle flag; the amount and type are the record.
    expect(credit.amount.toString()).toBe('1000');
    expect(credit.type).toBe('CREDIT');
    expect(credit.releasedAt).not.toBeNull();
  });

  it('rejects an adjustment with no reason', async () => {
    await expect(
      adjust({ trainerId, amount: 100, reason: '  ', adminId: 'admin-test' }),
    ).rejects.toBeInstanceOf(WalletError);
  });

  it('keeps decimals exact rather than drifting through floats', async () => {
    // 0.1 + 0.2 territory: three credits that a float would not add cleanly.
    for (const [i, amount] of [10.1, 20.2, 30.3].entries()) {
      await creditTraineePayment({
        trainerId,
        subscriptionId: `sub-${TAG}-dec-${i}`,
        amount: new Prisma.Decimal(amount),
        commission: 0,
        currency: 'EGP',
      });
    }
    const state = await invariantHolds();
    expect(state.pendingBalance.toString()).toBe('60.6');
  });
});

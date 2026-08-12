import { Prisma } from '@prisma/client';
import type { PayoutMethod, WalletTxType } from '@prisma/client';
import { prisma } from './prisma';
import { getSetting } from './settings';

/**
 * The coach's money.
 *
 * Two rules hold everything else up:
 *
 * 1. `WalletTransaction` is append-only. Nothing updates or deletes a row; a
 *    mistake is corrected with an opposing ADJUSTMENT. That is what makes the
 *    ledger answer "why is this number what it is" months later.
 * 2. The balances on `Wallet` are a cache of the ledger, never an independent
 *    source of truth: `balance + pendingBalance` always equals the sum of the
 *    money-moving entries. `walletInvariant()` checks it and the tests assert
 *    it after every kind of operation.
 *
 * Every mutation goes through `post()`, which does both in one transaction.
 */

export class WalletError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'FROZEN'
      | 'DISABLED'
      | 'INSUFFICIENT'
      | 'BELOW_MIN'
      | 'ABOVE_MAX'
      | 'MONTHLY_CAP'
      | 'DUPLICATE'
      | 'NOT_FOUND',
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

/** COMMISSION_FEE is a bookkeeping note for the profit report, not the coach's money. */
const MOVES_MONEY: ReadonlySet<WalletTxType> = new Set([
  'CREDIT',
  'HOLD_RELEASE',
  'PAYOUT',
  'REVERSAL',
  'ADJUSTMENT',
]);

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

export interface PayoutLimits {
  enabled: boolean;
  minAmount: number;
  maxPerRequest: number;
  maxPerMonth: number;
  holdDays: number;
  methods: PayoutMethod[];
}

/** Admin-controlled payout policy, read from AppSetting with safe defaults. */
export async function payoutLimits(): Promise<PayoutLimits> {
  const [enabled, min, perRequest, perMonth, holdDays, methods] = await Promise.all([
    getSetting('payout.enabled'),
    getSetting('payout.min_amount'),
    getSetting('payout.max_per_request'),
    getSetting('payout.max_per_month'),
    getSetting('payout.hold_days'),
    getSetting('payout.methods'),
  ]);

  const num = (value: string, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  return {
    enabled: enabled !== 'false',
    minAmount: num(min, 500),
    maxPerRequest: num(perRequest, 20000),
    maxPerMonth: num(perMonth, 50000),
    holdDays: num(holdDays, 7),
    methods: (methods || 'BANK,INSTAPAY,VODAFONE_CASH,WISE')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean) as PayoutMethod[],
  };
}

export async function ensureWallet(trainerId: string, currency = 'EGP') {
  return prisma.wallet.upsert({
    where: { trainerId },
    update: {},
    create: { trainerId, currency },
  });
}

interface PostInput {
  walletId: string;
  type: WalletTxType;
  /** Signed. Positive adds to the coach's money, negative takes it away. */
  amount: Prisma.Decimal | number;
  currency: string;
  /** True when the amount lands in `pendingBalance` instead of `balance`. */
  toPending?: boolean;
  availableAt?: Date | null;
  refType?: string;
  refId?: string;
  note?: string;
  createdById?: string;
  tx?: Prisma.TransactionClient;
}

/**
 * Writes one ledger entry and moves the cached balances to match, atomically.
 *
 * The balance snapshot on the row is computed here rather than by the caller,
 * so a statement can be read back without re-adding the whole history, and so
 * a caller cannot record a balance that never existed.
 */
export async function post(input: PostInput) {
  const run = async (tx: Prisma.TransactionClient) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: input.walletId } });

    const amount = D(input.amount);
    const moves = MOVES_MONEY.has(input.type);

    let balance = D(wallet.balance);
    let pending = D(wallet.pendingBalance);

    if (moves) {
      if (input.toPending) pending = pending.add(amount);
      else balance = balance.add(amount);
    }

    const entry = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: input.type,
        amount,
        currency: input.currency,
        balanceAfter: balance,
        pendingBalanceAfter: pending,
        availableAt: input.availableAt ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        note: input.note ?? null,
        createdById: input.createdById ?? null,
      },
    });

    if (moves) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance,
          pendingBalance: pending,
          // Lifetime figures only ever grow, so they track the gross flows
          // rather than the net position.
          lifetimeEarned:
            input.type === 'CREDIT' && amount.gt(0)
              ? D(wallet.lifetimeEarned).add(amount)
              : undefined,
          lifetimeWithdrawn:
            input.type === 'PAYOUT' && amount.lt(0)
              ? D(wallet.lifetimeWithdrawn).add(amount.abs())
              : undefined,
        },
      });
    }

    return entry;
  };

  return input.tx ? run(input.tx) : prisma.$transaction(run);
}

/**
 * Credits a coach for an approved trainee payment.
 *
 * The net — payment minus the platform's commission — lands in
 * `pendingBalance` with an `availableAt` a hold window in the future, and the
 * commission is recorded as its own informational entry so the profit report
 * has a number to read that is not inferred by subtraction.
 *
 * Idempotent on the subscription id: approving the same receipt twice is a
 * plausible admin double-click and must not pay twice.
 */
export async function creditTraineePayment(input: {
  trainerId: string;
  subscriptionId: string;
  amount: Prisma.Decimal | number;
  commission: Prisma.Decimal | number;
  currency: string;
  createdById?: string;
}): Promise<{ net: Prisma.Decimal; availableAt: Date } | null> {
  const existing = await prisma.walletTransaction.findFirst({
    where: { type: 'CREDIT', refType: 'TraineeSubscription', refId: input.subscriptionId },
    select: { id: true },
  });
  if (existing) return null;

  const wallet = await ensureWallet(input.trainerId, input.currency);
  const { holdDays } = await payoutLimits();

  const gross = D(input.amount);
  const commission = D(input.commission);
  const net = gross.sub(commission);
  const availableAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await post({
      tx,
      walletId: wallet.id,
      type: 'CREDIT',
      amount: net,
      currency: input.currency,
      toPending: true,
      availableAt,
      refType: 'TraineeSubscription',
      refId: input.subscriptionId,
      createdById: input.createdById,
    });

    if (commission.gt(0)) {
      await post({
        tx,
        walletId: wallet.id,
        type: 'COMMISSION_FEE',
        amount: commission.neg(),
        currency: input.currency,
        refType: 'TraineeSubscription',
        refId: input.subscriptionId,
        createdById: input.createdById,
      });
    }
  });

  return { net, availableAt };
}

/**
 * Moves matured credits from pending to available.
 *
 * Run by the daily cron, and also lazily when a coach opens their wallet — a
 * cron that silently stopped should not mean a coach cannot see their money.
 */
export async function releaseMatured(trainerId?: string): Promise<number> {
  const due = await prisma.walletTransaction.findMany({
    where: {
      type: 'CREDIT',
      releasedAt: null,
      availableAt: { lte: new Date() },
      ...(trainerId ? { wallet: { trainerId } } : {}),
    },
    select: { id: true, walletId: true, amount: true, currency: true },
    take: 500,
  });

  for (const credit of due) {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: two runs of the cron overlapping must
      // not release the same credit twice.
      const fresh = await tx.walletTransaction.findFirst({
        where: { id: credit.id, releasedAt: null },
        select: { id: true },
      });
      if (!fresh) return;

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: credit.walletId } });
      const amount = D(credit.amount);
      const balance = D(wallet.balance).add(amount);
      const pending = D(wallet.pendingBalance).sub(amount);

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'HOLD_RELEASE',
          amount: 0,
          currency: credit.currency,
          balanceAfter: balance,
          pendingBalanceAfter: pending,
          refType: 'WalletTransaction',
          refId: credit.id,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance, pendingBalance: pending },
      });

      // The only update ever made to a ledger row, and it is a lifecycle flag
      // rather than a change to what the entry says happened.
      await tx.walletTransaction.update({
        where: { id: credit.id },
        data: { releasedAt: new Date() },
      });
    });
  }

  return due.length;
}

/**
 * Creates a payout request, moving the money out of `balance` immediately.
 *
 * Reserving up front is what stops a coach from requesting the same money
 * twice while the first request is still sitting in the admin's queue.
 */
export async function requestPayout(input: {
  trainerId: string;
  amount: number;
  method: PayoutMethod;
  /** Already encrypted by the caller. */
  destination: string;
}): Promise<{ id: string }> {
  const limits = await payoutLimits();
  if (!limits.enabled) throw new WalletError('السحب متوقف حاليًا', 'DISABLED');

  const wallet = await ensureWallet(input.trainerId);
  if (wallet.isFrozen) throw new WalletError('محفظتك موقوفة، كلّم الدعم', 'FROZEN');

  const amount = D(input.amount);
  if (amount.lt(limits.minAmount)) {
    throw new WalletError(`الحد الأدنى للسحب ${limits.minAmount}`, 'BELOW_MIN');
  }
  if (amount.gt(limits.maxPerRequest)) {
    throw new WalletError(`الحد الأقصى للطلب الواحد ${limits.maxPerRequest}`, 'ABOVE_MAX');
  }
  if (amount.gt(D(wallet.balance))) {
    throw new WalletError('المبلغ أكبر من رصيدك المتاح', 'INSUFFICIENT');
  }

  const open = await prisma.payoutRequest.findFirst({
    where: { walletId: wallet.id, status: { in: ['PENDING', 'APPROVED'] } },
    select: { id: true },
  });
  if (open) throw new WalletError('عندك طلب سحب قيد المعالجة بالفعل', 'DUPLICATE');

  // The monthly cap counts what has actually left plus what is committed to
  // leave, so a rejected request does not eat into it.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = await prisma.payoutRequest.aggregate({
    where: {
      walletId: wallet.id,
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
      createdAt: { gte: monthStart },
    },
    _sum: { amount: true },
  });
  const used = D(thisMonth._sum.amount ?? 0);
  if (used.add(amount).gt(limits.maxPerMonth)) {
    throw new WalletError(`الحد الشهري للسحب ${limits.maxPerMonth}`, 'MONTHLY_CAP');
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.payoutRequest.create({
      data: {
        walletId: wallet.id,
        amount,
        currency: wallet.currency,
        method: input.method,
        destination: input.destination,
      },
      select: { id: true },
    });

    // Out of available and into pending: still the coach's money, but no
    // longer spendable on a second request.
    await post({
      tx,
      walletId: wallet.id,
      type: 'PAYOUT',
      amount: amount.neg(),
      currency: wallet.currency,
      refType: 'PayoutRequest',
      refId: request.id,
      note: 'طلب سحب',
    });
    await post({
      tx,
      walletId: wallet.id,
      type: 'ADJUSTMENT',
      amount,
      currency: wallet.currency,
      toPending: true,
      refType: 'PayoutRequest',
      refId: request.id,
      note: 'حجز مبلغ طلب السحب',
    });

    return request;
  });
}

/** Marks a payout paid: the reserved amount leaves the wallet for good. */
export async function markPayoutPaid(input: {
  payoutId: string;
  adminId: string;
  proofUrl?: string;
  note?: string;
}): Promise<void> {
  const payout = await prisma.payoutRequest.findUnique({ where: { id: input.payoutId } });
  if (!payout || payout.status === 'PAID' || payout.status === 'REJECTED') {
    throw new WalletError('طلب السحب مش في حالة تسمح بده', 'NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    await tx.payoutRequest.update({
      where: { id: payout.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        reviewedById: input.adminId,
        reviewedAt: new Date(),
        proofUrl: input.proofUrl ?? null,
        adminNote: input.note ?? null,
      },
    });

    // Release the reservation held in pending — the money is genuinely gone.
    await post({
      tx,
      walletId: payout.walletId,
      type: 'ADJUSTMENT',
      amount: D(payout.amount).neg(),
      currency: payout.currency,
      toPending: true,
      refType: 'PayoutRequest',
      refId: payout.id,
      note: 'تحويل تم',
      createdById: input.adminId,
    });
  });
}

/** Rejects a payout and gives the coach their money back. */
export async function rejectPayout(input: {
  payoutId: string;
  adminId: string;
  reason: string;
}): Promise<void> {
  const payout = await prisma.payoutRequest.findUnique({ where: { id: input.payoutId } });
  if (!payout || payout.status === 'PAID' || payout.status === 'REJECTED') {
    throw new WalletError('طلب السحب مش في حالة تسمح بده', 'NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    await tx.payoutRequest.update({
      where: { id: payout.id },
      data: {
        status: 'REJECTED',
        adminNote: input.reason,
        reviewedById: input.adminId,
        reviewedAt: new Date(),
      },
    });

    await post({
      tx,
      walletId: payout.walletId,
      type: 'ADJUSTMENT',
      amount: D(payout.amount).neg(),
      currency: payout.currency,
      toPending: true,
      refType: 'PayoutRequest',
      refId: payout.id,
      note: 'إلغاء حجز طلب مرفوض',
      createdById: input.adminId,
    });
    await post({
      tx,
      walletId: payout.walletId,
      type: 'REVERSAL',
      amount: payout.amount,
      currency: payout.currency,
      refType: 'PayoutRequest',
      refId: payout.id,
      note: input.reason,
      createdById: input.adminId,
    });
  });
}

/** Admin correction. The reason is mandatory because this bypasses every rule. */
export async function adjust(input: {
  trainerId: string;
  amount: number;
  reason: string;
  adminId: string;
}): Promise<void> {
  if (!input.reason.trim()) throw new WalletError('السبب مطلوب', 'NOT_FOUND');
  const wallet = await ensureWallet(input.trainerId);
  await post({
    walletId: wallet.id,
    type: 'ADJUSTMENT',
    amount: input.amount,
    currency: wallet.currency,
    note: input.reason,
    createdById: input.adminId,
  });
}

/**
 * Recomputes the balances from the ledger and reports the difference.
 *
 * Returns zero drift when everything is consistent. Used by the tests as the
 * invariant, and available to an admin as a health check.
 */
export async function walletInvariant(walletId: string): Promise<{
  balance: Prisma.Decimal;
  pendingBalance: Prisma.Decimal;
  ledgerTotal: Prisma.Decimal;
  drift: Prisma.Decimal;
}> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  const rows = await prisma.walletTransaction.findMany({
    where: { walletId, type: { in: [...MOVES_MONEY] } },
    select: { amount: true },
  });

  const ledgerTotal = rows.reduce((sum, row) => sum.add(D(row.amount)), D(0));
  const held = D(wallet.balance).add(D(wallet.pendingBalance));

  return {
    balance: D(wallet.balance),
    pendingBalance: D(wallet.pendingBalance),
    ledgerTotal,
    drift: held.sub(ledgerTotal),
  };
}

/** Total owed to coaches — a liability, not revenue, in the profit report. */
export async function totalLiabilities(): Promise<{ available: number; pending: number }> {
  const totals = await prisma.wallet.aggregate({
    _sum: { balance: true, pendingBalance: true },
  });
  return {
    available: Number(totals._sum.balance ?? 0),
    pending: Number(totals._sum.pendingBalance ?? 0),
  };
}

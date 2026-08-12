import { setRequestLocale } from 'next-intl/server';
import { Wallet as WalletIcon, Clock, TrendingUp, Banknote } from 'lucide-react';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { ensureWallet, releaseMatured, payoutLimits } from '@/lib/wallet';
import { decimalToNumber, formatMoney, formatDate } from '@/lib/money';
import { TrainerPage } from '@/components/trainer/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { WalletPanel, type LedgerRow, type PayoutRow } from './wallet-panel';

/**
 * The coach's money.
 *
 * Two numbers matter here and they are given equal weight: what can be
 * withdrawn now, and what is still inside the hold window with the date it
 * frees up. A wallet that shows one total and hides the timing is a wallet
 * that generates support tickets.
 */
export default async function WalletPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  await ensureWallet(user.trainerId);
  // Lazy release: a cron that quietly stopped should not mean a coach cannot
  // see money that has matured.
  await releaseMatured(user.trainerId).catch(() => 0);

  const [wallet, limits] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({
      where: { trainerId: user.trainerId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 60 },
        payoutRequests: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    }),
    payoutLimits(),
  ]);


  const ledger: LedgerRow[] = wallet.transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    amount: decimalToNumber(tx.amount),
    balanceAfter: decimalToNumber(tx.balanceAfter),
    note: tx.note,
    availableAt: tx.availableAt ? formatDate(tx.availableAt, locale) : null,
    released: Boolean(tx.releasedAt),
    createdAt: formatDate(tx.createdAt, locale),
  }));

  const payouts: PayoutRow[] = wallet.payoutRequests.map((p) => ({
    id: p.id,
    amount: decimalToNumber(p.amount),
    method: p.method,
    status: p.status,
    adminNote: p.adminNote,
    proofUrl: p.proofUrl,
    createdAt: formatDate(p.createdAt, locale),
    paidAt: p.paidAt ? formatDate(p.paidAt, locale) : null,
  }));

  const available = decimalToNumber(wallet.balance);
  const pending = decimalToNumber(wallet.pendingBalance);
  const hasOpenRequest = payouts.some((p) => p.status === 'PENDING' || p.status === 'APPROVED');

  // Upcoming releases, so the pending number has a date attached to it.
  const upcoming = wallet.transactions
    .filter((tx) => tx.type === 'CREDIT' && !tx.releasedAt && tx.availableAt)
    .slice(0, 4)
    .map((tx) => ({
      amount: decimalToNumber(tx.amount),
      date: formatDate(tx.availableAt, locale),
    }));

  const stats = [
    {
      icon: WalletIcon,
      label: isAr ? 'متاح للسحب' : 'Available',
      value: formatMoney(available, wallet.currency, locale),
      tone: 'primary' as const,
    },
    {
      icon: Clock,
      label: isAr ? 'محجوز' : 'On hold',
      value: formatMoney(pending, wallet.currency, locale),
      tone: 'muted' as const,
    },
    {
      icon: TrendingUp,
      label: isAr ? 'إجمالي ما كسبته' : 'Lifetime earned',
      value: formatMoney(decimalToNumber(wallet.lifetimeEarned), wallet.currency, locale),
      tone: 'muted' as const,
    },
    {
      icon: Banknote,
      label: isAr ? 'إجمالي ما سحبته' : 'Lifetime withdrawn',
      value: formatMoney(decimalToNumber(wallet.lifetimeWithdrawn), wallet.currency, locale),
      tone: 'muted' as const,
    },
  ];

  return (
    <TrainerPage
      title={isAr ? 'المحفظة' : 'Wallet'}
      description={
        isAr
          ? 'فلوس اشتراكات متدربينك بعد خصم عمولة المنصة، واسحبها لحسابك.'
          : 'Your trainee subscription income, net of platform commission.'
      }
    >
      {wallet.isFrozen ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            {isAr ? 'محفظتك موقوفة مؤقتًا' : 'Your wallet is on hold'}
          </p>
          {wallet.freezeNote ? (
            <p className="mt-1 text-muted-foreground">{wallet.freezeNote}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <stat.icon className="size-3.5" />
                {stat.label}
              </p>
              <p
                className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                  stat.tone === 'primary' ? 'text-primary' : ''
                }`}
              >
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {ledger.length === 0 ? (
        <EmptyState
          title={isAr ? 'محفظتك لسه فاضية' : 'Your wallet is empty'}
          description={
            isAr
              ? 'أول ما متدرب يشترك معاك والإدارة تعتمد وصله، حصتك هتظهر هنا.'
              : 'As soon as a trainee subscribes and the receipt is approved, your share lands here.'
          }
        />
      ) : (
        <WalletPanel
          locale={locale}
          currency={wallet.currency}
          available={available}
          upcoming={upcoming}
          ledger={ledger}
          payouts={payouts}
          limits={{
            enabled: limits.enabled && !wallet.isFrozen,
            minAmount: limits.minAmount,
            maxPerRequest: limits.maxPerRequest,
            methods: limits.methods,
            holdDays: limits.holdDays,
          }}
          hasOpenRequest={hasOpenRequest}
        />
      )}
    </TrainerPage>
  );
}

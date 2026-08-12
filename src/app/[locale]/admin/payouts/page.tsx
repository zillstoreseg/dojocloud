import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { decimalToNumber, formatMoney, formatDate } from '@/lib/money';
import { totalLiabilities, payoutLimits } from '@/lib/wallet';
import { AdminPage } from '@/components/admin/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { PayoutQueue, type AdminPayoutRow, type WalletRow } from './payout-queue';

/**
 * Money the platform owes its coaches, and the queue for paying it out.
 *
 * The liabilities figure leads the screen because it is the number most easily
 * mistaken for revenue: it is cash the platform is holding on someone else's
 * behalf, and the profit report subtracts it for exactly that reason.
 */
export default async function AdminPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('payouts.read', locale);

  const isAr = locale === 'ar';

  const [requests, wallets, liabilities, limits] = await Promise.all([
    prisma.payoutRequest.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        wallet: {
          select: {
            currency: true,
            balance: true,
            trainer: { select: { id: true, fullName: true, username: true } },
          },
        },
      },
    }),
    prisma.wallet.findMany({
      orderBy: [{ balance: 'desc' }],
      take: 100,
      include: {
        trainer: { select: { id: true, fullName: true, username: true } },
        _count: { select: { payoutRequests: true } },
      },
    }),
    totalLiabilities(),
    payoutLimits(),
  ]);

  const currency = wallets[0]?.currency ?? 'EGP';

  const payoutRows: AdminPayoutRow[] = requests.map((row) => ({
    id: row.id,
    trainerId: row.wallet.trainer.id,
    trainerName: row.wallet.trainer.fullName,
    username: row.wallet.trainer.username,
    amount: decimalToNumber(row.amount),
    currency: row.currency,
    method: row.method,
    status: row.status,
    adminNote: row.adminNote,
    proofUrl: row.proofUrl,
    createdAt: formatDate(row.createdAt, locale),
    walletBalance: decimalToNumber(row.wallet.balance),
  }));

  const walletRows: WalletRow[] = wallets.map((w) => ({
    trainerId: w.trainer.id,
    trainerName: w.trainer.fullName,
    username: w.trainer.username,
    currency: w.currency,
    balance: decimalToNumber(w.balance),
    pending: decimalToNumber(w.pendingBalance),
    lifetimeEarned: decimalToNumber(w.lifetimeEarned),
    lifetimeWithdrawn: decimalToNumber(w.lifetimeWithdrawn),
    isFrozen: w.isFrozen,
    payoutCount: w._count.payoutRequests,
  }));

  const pendingCount = payoutRows.filter((p) => p.status === 'PENDING').length;

  const cards = [
    {
      label: isAr ? 'مستحق للمدربين (متاح)' : 'Owed to coaches (available)',
      value: formatMoney(liabilities.available, currency, locale),
      tone: 'warning',
    },
    {
      label: isAr ? 'محجوز في فترة الانتظار' : 'Held in the hold window',
      value: formatMoney(liabilities.pending, currency, locale),
      tone: 'muted',
    },
    {
      label: isAr ? 'إجمالي الالتزامات' : 'Total liabilities',
      value: formatMoney(liabilities.available + liabilities.pending, currency, locale),
      tone: 'primary',
    },
    {
      label: isAr ? 'طلبات في الانتظار' : 'Requests waiting',
      value: String(pendingCount),
      tone: pendingCount ? 'warning' : 'muted',
    },
  ];

  return (
    <AdminPage
      title={isAr ? 'المحفظة والسحوبات' : 'Wallets & payouts'}
      description={
        isAr
          ? 'أرصدة المدربين وطلبات السحب. الأرصدة دي مطلوبات على المنصة، مش أرباح.'
          : 'Coach balances and payout requests. These balances are liabilities, not revenue.'
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p
                className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                  card.tone === 'primary'
                    ? 'text-primary'
                    : card.tone === 'warning'
                      ? 'text-warning'
                      : ''
                }`}
              >
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <PayoutQueue
        locale={locale}
        payouts={payoutRows}
        wallets={walletRows}
        limits={{ holdDays: limits.holdDays, enabled: limits.enabled }}
      />
    </AdminPage>
  );
}

'use client';

import { useState, useTransition } from 'react';
import {
  Check,
  Eye,
  Snowflake,
  Sun,
  Upload,
  X,
  Scale,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { PayoutMethod, PayoutStatus } from '@prisma/client';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatMoney, formatNumber } from '@/lib/money';
import { revealDestination, payPayout, declinePayout, adjustWallet, setWalletFrozen } from './actions';

export interface AdminPayoutRow {
  id: string;
  trainerId: string;
  trainerName: string;
  username: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  status: PayoutStatus;
  adminNote: string | null;
  proofUrl: string | null;
  createdAt: string;
  walletBalance: number;
}

export interface WalletRow {
  trainerId: string;
  trainerName: string;
  username: string;
  currency: string;
  balance: number;
  pending: number;
  lifetimeEarned: number;
  lifetimeWithdrawn: number;
  isFrozen: boolean;
  payoutCount: number;
}

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  BANK: { ar: 'تحويل بنكي', en: 'Bank' },
  INSTAPAY: { ar: 'إنستاباي', en: 'InstaPay' },
  VODAFONE_CASH: { ar: 'فودافون كاش', en: 'Vodafone Cash' },
  WISE: { ar: 'Wise', en: 'Wise' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

/** The shape `revealDestination` returns, labelled for a human. */
const DESTINATION_LABELS: Record<string, { ar: string; en: string }> = {
  accountName: { ar: 'اسم صاحب الحساب', en: 'Account holder' },
  accountNumber: { ar: 'رقم الحساب', en: 'Account number' },
  bankName: { ar: 'البنك', en: 'Bank' },
  note: { ar: 'ملاحظة المدرب', en: 'Coach note' },
};

const STATUS_META: Record<
  PayoutStatus,
  { ar: string; en: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }
> = {
  PENDING: { ar: 'في الانتظار', en: 'Pending', variant: 'warning' },
  APPROVED: { ar: 'معتمد', en: 'Approved', variant: 'warning' },
  PAID: { ar: 'تم التحويل', en: 'Paid', variant: 'success' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', variant: 'destructive' },
};

export function PayoutQueue({
  locale,
  payouts,
  wallets,
  limits,
}: {
  locale: string;
  payouts: AdminPayoutRow[];
  wallets: WalletRow[];
  limits: { holdDays: number; enabled: boolean };
}) {
  const isAr = locale === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const pending = payouts.filter((p) => p.status === 'PENDING' || p.status === 'APPROVED');
  const history = payouts.filter((p) => p.status === 'PAID' || p.status === 'REJECTED');

  return (
    <Tabs defaultValue="queue">
      <TabsList>
        <TabsTrigger value="queue">
          {t('طلبات السحب', 'Payout queue')}
          {pending.length ? (
            <span className="ms-1.5 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground tabular-nums">
              {formatNumber(pending.length, locale)}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="wallets">{t('أرصدة المدربين', 'Coach balances')}</TabsTrigger>
        <TabsTrigger value="history">{t('السجل', 'History')}</TabsTrigger>
      </TabsList>

      <TabsContent value="queue">
        {!limits.enabled ? (
          <Alert className="mb-3">
            <AlertDescription>
              {t(
                'السحب متوقف من الإعدادات — المدربون مش قادرين يطلبوا دلوقتي.',
                'Withdrawals are paused in settings — coaches cannot request right now.',
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {pending.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t('مفيش طلبات مستنية.', 'Nothing waiting.')}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((payout) => (
              <PayoutCard key={payout.id} payout={payout} isAr={isAr} locale={locale} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="wallets">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('المدرب', 'Coach')}</TableHead>
                  <TableHead className="text-end">{t('متاح', 'Available')}</TableHead>
                  <TableHead className="text-end">{t('محجوز', 'On hold')}</TableHead>
                  <TableHead className="text-end">{t('إجمالي مكتسب', 'Earned')}</TableHead>
                  <TableHead className="text-end">{t('مسحوب', 'Withdrawn')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((wallet) => (
                  <WalletTableRow key={wallet.trainerId} wallet={wallet} isAr={isAr} locale={locale} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            `المبالغ الجديدة بتفضل محجوزة ${formatNumber(limits.holdDays, locale)} أيام قبل ما تبقى متاحة للسحب.`,
            `New credits are held for ${limits.holdDays} days before they become withdrawable.`,
          )}
        </p>
      </TabsContent>

      <TabsContent value="history">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('المدرب', 'Coach')}</TableHead>
                  <TableHead className="text-end">{t('المبلغ', 'Amount')}</TableHead>
                  <TableHead>{t('الوسيلة', 'Method')}</TableHead>
                  <TableHead>{t('الحالة', 'Status')}</TableHead>
                  <TableHead>{t('ملاحظة', 'Note')}</TableHead>
                  <TableHead>{t('التاريخ', 'Date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{row.trainerName}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        /c/{row.username}
                      </p>
                    </TableCell>
                    <TableCell className="text-end font-medium tabular-nums">
                      {formatMoney(row.amount, row.currency, locale)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {METHOD_LABELS[row.method]?.[isAr ? 'ar' : 'en'] ?? row.method}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_META[row.status].variant}>
                        {STATUS_META[row.status][isAr ? 'ar' : 'en']}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                      {row.adminNote ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      {row.createdAt}
                      {row.proofUrl ? (
                        <a
                          href={row.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ms-2 inline-flex text-primary"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function PayoutCard({
  payout,
  isAr,
  locale,
}: {
  payout: AdminPayoutRow;
  isAr: boolean;
  locale: string;
}) {
  const router = useRouter();
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const [destination, setDestination] = useState<Record<string, string | null> | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startBusy(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? t('حصل خطأ', 'Something went wrong'));
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{payout.trainerName}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">
              /c/{payout.username}
            </p>
          </div>
          <div className="text-end">
            <p className="font-display text-xl font-bold tabular-nums text-primary">
              {formatMoney(payout.amount, payout.currency, locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              {METHOD_LABELS[payout.method]?.[isAr ? 'ar' : 'en'] ?? payout.method} ·{' '}
              {payout.createdAt}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            `الرصيد المتاح بعد الحجز: ${formatMoney(payout.walletBalance, payout.currency, locale)}`,
            `Remaining available: ${formatMoney(payout.walletBalance, payout.currency, locale)}`,
          )}
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {/* Credentials are shown only when asked for, and the ask is audited. */}
        {destination ? (
          <dl className="space-y-1 rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
            {Object.entries(destination)
              .filter(([, value]) => Boolean(value))
              .map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {DESTINATION_LABELS[key]?.[isAr ? 'ar' : 'en'] ?? key}
                  </dt>
                  <dd className="font-medium" dir="ltr">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              startBusy(async () => {
                const result = await revealDestination({ id: payout.id });
                if (result.ok && result.destination) setDestination(result.destination);
                else setError(result.error ?? null);
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <Eye />}
            {t('اعرض بيانات التحويل', 'Reveal transfer details')}
          </Button>
        )}

        {rejecting ? (
          <div className="space-y-2">
            <Field label={t('سبب الرفض', 'Reason')} required>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || reason.trim().length < 3}
                onClick={() => run(() => declinePayout({ id: payout.id, reason }))}
              >
                {t('أكّد الرفض', 'Confirm rejection')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                {t('رجوع', 'Back')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 border-t border-border/60 pt-3">
            <Field label={t('إثبات التحويل (اختياري)', 'Transfer proof (optional)')}>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setProof(e.target.files?.[0] ?? null)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  const form = new FormData();
                  if (proof) form.set('proof', proof);
                  run(() => payPayout({ id: payout.id, proof: proof ? form : undefined }));
                }}
              >
                <Check />
                {t('تم التحويل', 'Mark as paid')}
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
                <X />
                {t('رفض', 'Decline')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WalletTableRow({
  wallet,
  isAr,
  locale,
}: {
  wallet: WalletRow;
  isAr: boolean;
  locale: string;
}) {
  const router = useRouter();
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startBusy(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? t('حصل خطأ', 'Something went wrong'));
      else {
        setOpen(false);
        setAmount('');
        setReason('');
        router.refresh();
      }
    });
  }

  return (
    <>
      <TableRow className={wallet.isFrozen ? 'opacity-60' : undefined}>
        <TableCell>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {wallet.trainerName}
            {wallet.isFrozen ? (
              <Badge variant="destructive">{t('موقوفة', 'Frozen')}</Badge>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            /c/{wallet.username}
          </p>
        </TableCell>
        <TableCell className="text-end font-medium tabular-nums">
          {formatMoney(wallet.balance, wallet.currency, locale)}
        </TableCell>
        <TableCell className="text-end tabular-nums text-muted-foreground">
          {formatMoney(wallet.pending, wallet.currency, locale)}
        </TableCell>
        <TableCell className="text-end tabular-nums text-muted-foreground">
          {formatMoney(wallet.lifetimeEarned, wallet.currency, locale)}
        </TableCell>
        <TableCell className="text-end tabular-nums text-muted-foreground">
          {formatMoney(wallet.lifetimeWithdrawn, wallet.currency, locale)}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(true)}
              aria-label={t('تسوية', 'Adjust')}
            >
              <Scale />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={wallet.isFrozen ? t('فك التجميد', 'Unfreeze') : t('تجميد', 'Freeze')}
              onClick={() =>
                run(() =>
                  setWalletFrozen({
                    trainerId: wallet.trainerId,
                    frozen: !wallet.isFrozen,
                    note: wallet.isFrozen ? undefined : t('قيد المراجعة', 'Under review'),
                  }),
                )
              }
            >
              {wallet.isFrozen ? <Sun /> : <Snowflake className="text-destructive" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('تسوية يدوية', 'Manual adjustment')}</DialogTitle>
            <DialogDescription>
              {t(
                `${wallet.trainerName} — موجب يزوّد الرصيد، سالب يخصم منه.`,
                `${wallet.trainerName} — positive credits, negative debits.`,
              )}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Field label={t('المبلغ', 'Amount')} required>
            <Input
              type="number"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label={t('السبب', 'Reason')} required hint={t('بيتسجّل في التدقيق', 'Recorded in the audit log')}>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button
              disabled={busy || !amount || reason.trim().length < 3}
              onClick={() =>
                run(() =>
                  adjustWallet({
                    trainerId: wallet.trainerId,
                    amount: Number(amount),
                    reason,
                  }),
                )
              }
            >
              <Upload />
              {t('سجّل التسوية', 'Record adjustment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

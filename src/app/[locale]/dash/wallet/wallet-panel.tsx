'use client';

import { useState, useTransition } from 'react';
import { ArrowDownToLine, ExternalLink, X } from 'lucide-react';
import type { PayoutMethod, PayoutStatus, WalletTxType } from '@prisma/client';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChipRadio } from '@/components/ui/chip-select';
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
import { cn } from '@/lib/utils';
import { createPayoutRequest, cancelPayoutRequest } from './actions';

export interface LedgerRow {
  id: string;
  type: WalletTxType;
  amount: number;
  balanceAfter: number;
  note: string | null;
  availableAt: string | null;
  released: boolean;
  createdAt: string;
}

export interface PayoutRow {
  id: string;
  amount: number;
  method: PayoutMethod;
  status: PayoutStatus;
  adminNote: string | null;
  proofUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}

const TX_LABELS: Record<WalletTxType, { ar: string; en: string }> = {
  CREDIT: { ar: 'اشتراك متدرب', en: 'Trainee payment' },
  HOLD_RELEASE: { ar: 'إفراج عن مبلغ محجوز', en: 'Hold released' },
  COMMISSION_FEE: { ar: 'عمولة المنصة', en: 'Platform commission' },
  PAYOUT: { ar: 'طلب سحب', en: 'Payout' },
  REVERSAL: { ar: 'استرجاع', en: 'Reversal' },
  ADJUSTMENT: { ar: 'تسوية', en: 'Adjustment' },
};

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  BANK: { ar: 'تحويل بنكي', en: 'Bank' },
  INSTAPAY: { ar: 'إنستاباي', en: 'InstaPay' },
  VODAFONE_CASH: { ar: 'فودافون كاش', en: 'Vodafone Cash' },
  WISE: { ar: 'Wise', en: 'Wise' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

const STATUS_META: Record<PayoutStatus, { ar: string; en: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  PENDING: { ar: 'قيد المراجعة', en: 'Under review', variant: 'warning' },
  APPROVED: { ar: 'تمت الموافقة', en: 'Approved', variant: 'warning' },
  PAID: { ar: 'تم التحويل', en: 'Paid', variant: 'success' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', variant: 'destructive' },
};

/**
 * Statement, payout requests, and the withdraw form.
 *
 * The withdraw button carries its own guardrails in the UI — minimum, cap,
 * available balance — but every one of them is re-checked on the server; these
 * exist so a coach finds out before typing an amount, not after.
 */
export function WalletPanel({
  locale,
  currency,
  available,
  upcoming,
  ledger,
  payouts,
  limits,
  hasOpenRequest,
}: {
  locale: string;
  currency: string;
  available: number;
  upcoming: { amount: number; date: string }[];
  ledger: LedgerRow[];
  payouts: PayoutRow[];
  limits: {
    enabled: boolean;
    minAmount: number;
    maxPerRequest: number;
    methods: PayoutMethod[];
    holdDays: number;
  };
  hasOpenRequest: boolean;
}) {
  const router = useRouter();
  const isAr = locale === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayoutMethod>(limits.methods[0] ?? 'BANK');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const canWithdraw = limits.enabled && !hasOpenRequest && available >= limits.minAmount;

  function submit() {
    setError(null);
    startBusy(async () => {
      const result = await createPayoutRequest({
        amount: Number(amount),
        method,
        accountName,
        accountNumber,
        bankName,
      });
      if (result.ok) {
        setOpen(false);
        setAmount('');
        router.refresh();
      } else {
        setError(result.error ?? t('حصل خطأ', 'Something went wrong'));
      }
    });
  }

  function cancel(id: string) {
    if (!confirm(t('تلغي طلب السحب؟', 'Cancel this payout request?'))) return;
    startBusy(async () => {
      await cancelPayoutRequest({ id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            {upcoming.length ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('هيتاح للسحب قريبًا', 'Becoming available soon')}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {upcoming.map((row, i) => (
                    <li key={i} className="tabular-nums">
                      <span className="font-medium">{formatMoney(row.amount, currency, locale)}</span>
                      <span className="text-muted-foreground"> · {row.date}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  `كل فلوسك متاحة — الحجز بيستمر ${formatNumber(limits.holdDays, locale)} أيام بعد كل اشتراك.`,
                  `Everything is available — new payments are held for ${limits.holdDays} days.`,
                )}
              </p>
            )}
          </div>

          <div className="text-end">
            <Button size="lg" disabled={!canWithdraw} onClick={() => setOpen(true)}>
              <ArrowDownToLine />
              {t('اسحب فلوسك', 'Withdraw')}
            </Button>
            {!limits.enabled ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('السحب متوقف حاليًا', 'Withdrawals are paused')}
              </p>
            ) : hasOpenRequest ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('عندك طلب قيد المعالجة', 'You have a request in progress')}
              </p>
            ) : available < limits.minAmount ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `الحد الأدنى ${formatMoney(limits.minAmount, currency, locale)}`,
                  `Minimum ${formatMoney(limits.minAmount, currency, locale)}`,
                )}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">{t('كشف الحساب', 'Statement')}</TabsTrigger>
          <TabsTrigger value="payouts">
            {t('طلبات السحب', 'Payouts')}
            {payouts.length ? (
              <span className="ms-1.5 tabular-nums text-muted-foreground">
                {formatNumber(payouts.length, locale)}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('الحركة', 'Entry')}</TableHead>
                    <TableHead className="text-end">{t('المبلغ', 'Amount')}</TableHead>
                    <TableHead className="text-end">{t('الرصيد بعدها', 'Balance')}</TableHead>
                    <TableHead>{t('التاريخ', 'Date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="text-sm font-medium">
                          {TX_LABELS[row.type][isAr ? 'ar' : 'en']}
                        </p>
                        {row.note ? (
                          <p className="text-xs text-muted-foreground">{row.note}</p>
                        ) : null}
                        {row.type === 'CREDIT' && !row.released && row.availableAt ? (
                          <p className="text-xs text-brand-accent">
                            {t(`محجوز حتى ${row.availableAt}`, `Held until ${row.availableAt}`)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-end font-medium tabular-nums',
                          row.amount > 0 ? 'text-primary' : row.amount < 0 ? 'text-destructive' : '',
                        )}
                      >
                        {row.amount === 0
                          ? '—'
                          : `${row.amount > 0 ? '+' : ''}${formatMoney(row.amount, currency, locale)}`}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {formatMoney(row.balanceAfter, currency, locale)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                        {row.createdAt}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          {payouts.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t('لسه مطلبتش أي سحب.', 'You have not requested a payout yet.')}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {payouts.map((payout) => (
                <Card key={payout.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-lg font-semibold tabular-nums">
                          {formatMoney(payout.amount, currency, locale)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {METHOD_LABELS[payout.method]?.[isAr ? 'ar' : 'en'] ?? payout.method}
                          {' · '}
                          {payout.createdAt}
                        </p>
                      </div>
                      <Badge variant={STATUS_META[payout.status].variant}>
                        {STATUS_META[payout.status][isAr ? 'ar' : 'en']}
                      </Badge>
                    </div>

                    {payout.adminNote ? (
                      <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                        {payout.adminNote}
                      </p>
                    ) : null}

                    <div className="flex items-center gap-2">
                      {payout.proofUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={payout.proofUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                            {t('إثبات التحويل', 'Proof')}
                          </a>
                        </Button>
                      ) : null}
                      {payout.status === 'PENDING' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => cancel(payout.id)}
                        >
                          <X />
                          {t('إلغاء', 'Cancel')}
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('طلب سحب', 'Request a payout')}</DialogTitle>
            <DialogDescription>
              {t(
                `المتاح ${formatMoney(available, currency, locale)} · الحد الأدنى ${formatMoney(limits.minAmount, currency, locale)}`,
                `${formatMoney(available, currency, locale)} available · minimum ${formatMoney(limits.minAmount, currency, locale)}`,
              )}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <Field label={t('المبلغ', 'Amount')} htmlFor="w-amount" required>
              <Input
                id="w-amount"
                type="number"
                inputMode="decimal"
                min={limits.minAmount}
                max={Math.min(available, limits.maxPerRequest)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>

            <Field label={t('وسيلة التحويل', 'Method')} required>
              <ChipRadio
                value={method}
                onChange={(v) => setMethod(v as PayoutMethod)}
                options={limits.methods.map((m) => ({
                  value: m,
                  label: METHOD_LABELS[m]?.[isAr ? 'ar' : 'en'] ?? m,
                }))}
              />
            </Field>

            <Field label={t('اسم صاحب الحساب', 'Account holder')} htmlFor="w-name" required>
              <Input
                id="w-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </Field>

            <Field
              label={t('رقم الحساب / المحفظة', 'Account or wallet number')}
              htmlFor="w-number"
              required
            >
              <Input
                id="w-number"
                dir="ltr"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </Field>

            {method === 'BANK' ? (
              <Field label={t('اسم البنك', 'Bank name')} htmlFor="w-bank">
                <Input id="w-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </Field>
            ) : null}

            <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              {t(
                'بيانات حسابك بتتخزّن مشفّرة، وبتتفتح مرة واحدة بس وقت التحويل.',
                'Your account details are stored encrypted and opened only at transfer time.',
              )}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button
              disabled={busy || !amount || !accountName.trim() || !accountNumber.trim()}
              onClick={submit}
            >
              {t('ابعت الطلب', 'Send request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

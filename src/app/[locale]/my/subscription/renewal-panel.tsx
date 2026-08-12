'use client';

import { useRef, useState, useTransition } from 'react';
import { Check, Copy, Loader2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { submitRenewalReceipt } from '../actions';

export interface PendingSub {
  id: string;
  packageName: string;
  amount: number;
  currency: string;
  hasReceipt: boolean;
}

interface Props {
  locale: string;
  pending: PendingSub | null;
  packages: { id: string; name: string; price: string; durationDays: number }[];
  instructions: {
    text: string;
    bankName: string;
    bankAccount: string;
    instapay: string;
    vodafoneCash: string;
  };
  coachName: string;
}

/**
 * Renewal.
 *
 * A trainee whose receipt is already with an admin sees a status, not a form:
 * paying twice because the first upload looked like it did nothing is the most
 * expensive confusion a manual payment flow can create.
 */
export function RenewalPanel({ locale, pending, packages, instructions, coachName }: Props) {
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState('');
  const [uploading, startUploading] = useTransition();

  const transferLines = [
    { label: isAr ? 'اسم البنك' : 'Bank', value: instructions.bankName },
    { label: isAr ? 'رقم الحساب' : 'Account', value: instructions.bankAccount },
    { label: 'InstaPay', value: instructions.instapay },
    { label: isAr ? 'فودافون كاش' : 'Vodafone Cash', value: instructions.vodafoneCash },
  ].filter((line) => line.value);

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(
      () => toast({ title: isAr ? 'اتنسخ' : 'Copied', variant: 'success' }),
      () => toast({ title: isAr ? 'مقدرناش ننسخ' : 'Could not copy', variant: 'error' }),
    );
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !pending) return;

    const formData = new FormData();
    formData.append('receipt', file);
    formData.append('subscriptionId', pending.id);
    formData.append('reference', reference);

    startUploading(async () => {
      const result = await submitRenewalReceipt(formData);
      toast(
        result.ok
          ? {
              title: isAr ? 'وصل عندنا' : 'Receipt received',
              description: isAr ? 'هيتراجع خلال ساعات' : 'It will be reviewed shortly',
              variant: 'success',
            }
          : { title: result.error ?? 'خطأ', variant: 'error' },
      );
    });
  }

  if (pending?.hasReceipt) {
    return (
      <Card className="border-warning/40">
        <CardContent className="flex flex-wrap items-center gap-4 p-6">
          <Badge variant="warning">{isAr ? 'قيد المراجعة' : 'Under review'}</Badge>
          <p className="text-sm">
            {isAr
              ? `وصلك وصل عندنا لباقة «${pending.packageName}». أول ما يتعتمد هيتفعّل اشتراكك و${coachName} هيتبلّغ.`
              : `We have your receipt for “${pending.packageName}”. Once it is approved your subscription activates and ${coachName} is notified.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (pending) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="font-display font-semibold">
              {isAr ? 'ارفع وصل التحويل' : 'Upload your transfer receipt'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? `باقة «${pending.packageName}» — حوّل المبلغ وارفع صورة الوصل.`
                : `“${pending.packageName}” — transfer the amount and upload a photo of the receipt.`}
            </p>
          </div>

          {instructions.text ? (
            <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">
              {instructions.text}
            </p>
          ) : null}

          {transferLines.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {transferLines.map((line) => (
                <li key={line.label} className="flex items-center gap-3 p-3">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{line.label}</span>
                  <span className="min-w-0 flex-1 truncate font-medium" dir="ltr">
                    {line.value}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => copy(line.value)}>
                    <Copy className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="ref" className="text-xs">
              {isAr ? 'رقم العملية (اختياري)' : 'Reference (optional)'}
            </Label>
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" />
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={onPick}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {isAr ? 'ارفع الوصل' : 'Upload receipt'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (packages.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div>
          <h2 className="font-display font-semibold">{isAr ? 'باقات مدربك' : 'Your coach’s packages'}</h2>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'كلّم مدربك عشان يبدأ لك التجديد، وهتلاقي خطوة الوصل هنا.'
              : 'Ask your coach to start a renewal and the receipt step appears here.'}
          </p>
        </div>
        <ul className="divide-y rounded-lg border">
          {packages.map((pkg) => (
            <li key={pkg.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{pkg.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {isAr ? `${pkg.durationDays} يوم` : `${pkg.durationDays} days`}
                </span>
              </span>
              <span className="shrink-0 font-display font-semibold tabular-nums">{pkg.price}</span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5 text-success" />
          {isAr ? 'الدفع بيتراجع من إدارة المنصة قبل التفعيل.' : 'Payments are reviewed by the platform before activation.'}
        </p>
      </CardContent>
    </Card>
  );
}

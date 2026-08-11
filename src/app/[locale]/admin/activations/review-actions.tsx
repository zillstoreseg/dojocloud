'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import {
  approvePayment,
  approveTrainer,
  rejectPayment,
  rejectTrainer,
  reviewCertificate,
  reviewTraineeSubscription,
  type ActionResult,
} from './actions';

/**
 * What is being reviewed. The client picks the server action from this, because
 * a server component cannot hand a closure across the boundary — only a
 * serialisable value or a server action reference.
 */
export type ReviewKind = 'trainer' | 'certificate' | 'payment' | 'traineeSubscription';

const APPROVE: Record<ReviewKind, (id: string) => Promise<ActionResult>> = {
  trainer: (id) => approveTrainer({ id }),
  certificate: (id) => reviewCertificate({ id, approve: true }),
  payment: (id) => approvePayment({ id }),
  traineeSubscription: (id) => reviewTraineeSubscription({ id, approve: true }),
};

const REJECT: Record<ReviewKind, (id: string, reason: string) => Promise<ActionResult>> = {
  trainer: (id, reason) => rejectTrainer({ id, reason }),
  certificate: (id, reason) => reviewCertificate({ id, approve: false, note: reason }),
  payment: (id, reason) => rejectPayment({ id, reason }),
  traineeSubscription: (id, reason) => reviewTraineeSubscription({ id, approve: false, note: reason }),
};

interface Props {
  kind: ReviewKind;
  id: string;
  itemLabel: string;
  size?: 'sm' | 'default';
}

export function ReviewActions({ kind, id, itemLabel, size = 'sm' }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleResult(result: ActionResult) {
    if (result.ok) {
      toast({ title: result.message ?? (isAr ? 'تم' : 'Done'), variant: 'success' });
      setRejectOpen(false);
      setReason('');
      startTransition(() => router.refresh());
    } else {
      setError(result.error ?? null);
      toast({ title: result.error ?? (isAr ? 'حدث خطأ' : 'Error'), variant: 'error' });
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size={size}
          variant="success"
          loading={pending}
          onClick={() => startTransition(async () => handleResult(await APPROVE[kind](id)))}
        >
          <Check />
          {isAr ? 'اعتماد' : 'Approve'}
        </Button>
        <Button size={size} variant="outline" onClick={() => setRejectOpen(true)}>
          <X />
          {isAr ? 'رفض' : 'Reject'}
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? `رفض ${itemLabel}` : `Reject ${itemLabel}`}</DialogTitle>
            <DialogDescription>
              {isAr
                ? 'السبب سيصل للمستخدم في إشعار، فاكتبه بوضوح.'
                : 'The reason is sent to the user as a notification — be specific.'}
            </DialogDescription>
          </DialogHeader>

          <Field label={isAr ? 'سبب الرفض' : 'Rejection reason'} required error={error}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder={isAr ? 'مثال: صورة الشهادة غير واضحة، برجاء رفعها بجودة أعلى.' : 'e.g. The certificate image is unreadable, please re-upload it.'}
            />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={reason.trim().length < 3}
              onClick={() => startTransition(async () => handleResult(await REJECT[kind](id, reason)))}
            >
              {isAr ? 'تأكيد الرفض' : 'Confirm rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Opens an uploaded receipt or certificate in a modal preview. */
export function FilePreview({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const isAr = locale === 'ar';
  const isPdf = url.toLowerCase().endsWith('.pdf');

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {isAr ? 'عرض الملف' : 'View file'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          {isPdf ? (
            <iframe src={url} className="h-[70vh] w-full rounded border" title={label} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="max-h-[70vh] w-full rounded border object-contain" />
          )}
          <DialogFooter>
            <Button variant="outline" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {isAr ? 'فتح في تبويب جديد' : 'Open in new tab'}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

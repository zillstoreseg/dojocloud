'use client';

import { useLocale } from 'next-intl';
import { ReviewActions, FilePreview } from '../activations/review-actions';

export function PaymentRowActions({
  paymentId,
  status,
  receiptUrl,
  canReview,
}: {
  paymentId: string;
  status: string;
  receiptUrl: string | null;
  canReview: boolean;
}) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  return (
    <div className="flex items-center justify-end gap-2">
      {receiptUrl ? (
        <FilePreview url={receiptUrl} label={isAr ? 'إيصال الدفع' : 'Payment receipt'} />
      ) : null}
      {status === 'PENDING' && canReview ? (
        <ReviewActions kind="payment" id={paymentId} itemLabel={isAr ? 'الدفعة' : 'payment'} />
      ) : null}
    </div>
  );
}

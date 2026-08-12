'use client';

import { useState, useTransition } from 'react';
import { EyeOff, Undo2 } from 'lucide-react';
import type { PageStatus } from '@prisma/client';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setPageModeration } from './actions';

/**
 * Takedown control. Archiving asks for a reason because it is an action taken
 * against a paying customer's public page: the coach is told why, and the
 * reason lands in the audit log.
 */
export function PageModeration({
  id,
  status,
  isAr,
}: {
  id: string;
  status: PageStatus;
  isAr: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const archived = status === 'HIDDEN';

  function run(archive: boolean) {
    setError(null);
    startBusy(async () => {
      const result = await setPageModeration({ id, archive, reason });
      if (result.ok) {
        setOpen(false);
        setReason('');
        router.refresh();
      } else {
        setError(result.error ?? (isAr ? 'حصل خطأ' : 'Something went wrong'));
      }
    });
  }

  if (archived) {
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(false)}>
        <Undo2 />
        {isAr ? 'رجّعها' : 'Restore'}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={isAr ? 'إخفاء الصفحة' : 'Hide page'}
      >
        <EyeOff className="text-destructive" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? 'إخفاء الصفحة' : 'Hide this page'}</DialogTitle>
            <DialogDescription>
              {isAr
                ? 'الصفحة هتختفي من الإنترنت فورًا، والمدرب هيتبلغ بالسبب.'
                : 'The page goes offline immediately and the coach is told why.'}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Field label={isAr ? 'السبب' : 'Reason'} required>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => run(true)}>
              {isAr ? 'أخفِ الصفحة' : 'Hide page'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

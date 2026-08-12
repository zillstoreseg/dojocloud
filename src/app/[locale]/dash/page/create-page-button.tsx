'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ensurePage } from './actions';

export function CreatePageButton({ isAr }: { isAr: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        size="lg"
        disabled={busy}
        onClick={() =>
          startBusy(async () => {
            const result = await ensurePage(isAr);
            if (result.ok) router.refresh();
            else setError(result.error ?? (isAr ? 'حصل خطأ' : 'Something went wrong'));
          })
        }
      >
        <Sparkles />
        {isAr ? 'جهّزلي صفحة' : 'Build my page'}
      </Button>
    </div>
  );
}

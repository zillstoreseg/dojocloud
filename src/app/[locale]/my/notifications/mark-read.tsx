'use client';

import { useTransition } from 'react';
import { CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markNotificationsRead } from '../actions';

export function MarkReadButton({ locale }: { locale: string }) {
  const [pending, start] = useTransition();
  const isAr = locale === 'ar';

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => void (await markNotificationsRead()))}
    >
      {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
      {isAr ? 'علّم الكل كمقروء' : 'Mark all read'}
    </Button>
  );
}

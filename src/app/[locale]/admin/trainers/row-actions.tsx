'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLocale } from 'next-intl';
import { ExternalLink, Eye, MoreHorizontal, Pause, Play, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toaster';
import { beginImpersonation, setUserStatus } from '../users/actions';

export function TrainerRowActions({
  trainerId,
  userId,
  username,
  userStatus,
  canImpersonate,
}: {
  trainerId: string;
  userId: string;
  username: string;
  userStatus: string;
  canImpersonate: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const { update } = useSession();
  const [pending, startTransition] = useTransition();

  const suspended = userStatus === 'SUSPENDED';

  function toggleStatus() {
    startTransition(async () => {
      const result = await setUserStatus({ id: userId, status: suspended ? 'ACTIVE' : 'SUSPENDED' });
      toast({
        title: result.ok ? (result.message ?? '') : (result.error ?? ''),
        variant: result.ok ? 'success' : 'error',
      });
      if (result.ok) router.refresh();
    });
  }

  function impersonate() {
    startTransition(async () => {
      const result = await beginImpersonation({ id: userId });
      if (!result.ok) {
        toast({ title: result.error ?? '', variant: 'error' });
        return;
      }
      // Swap the session's identity claims, then land on the trainer dashboard.
      await update({ impersonateUserId: userId });
      router.push(`/${locale}/dash`);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={isAr ? 'إجراءات' : 'Actions'}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push(`/${locale}/admin/trainers/${trainerId}`)}>
          <Eye />
          {isAr ? 'عرض الملف' : 'View profile'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(`/${locale}/c/${username}`, '_blank')}>
          <ExternalLink />
          {isAr ? 'فتح صفحته العامة' : 'Open public page'}
        </DropdownMenuItem>
        {canImpersonate ? (
          <DropdownMenuItem onClick={impersonate} disabled={pending}>
            <UserCheck />
            {isAr ? 'الدخول كهذا المدرب' : 'Sign in as this trainer'}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive={!suspended} onClick={toggleStatus} disabled={pending}>
          {suspended ? <Play /> : <Pause />}
          {suspended ? (isAr ? 'إلغاء التعليق' : 'Unsuspend') : isAr ? 'تعليق الحساب' : 'Suspend account'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

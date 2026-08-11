'use client';

import { signOut, useSession } from 'next-auth/react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Globe, LogOut, ShieldOff, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials } from '@/lib/utils';

export function AdminTopbar({ title }: { title: string }) {
  const { data: session, update } = useSession();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const isAr = locale === 'ar';

  const user = session?.user;
  const impersonating = Boolean(user?.impersonatorId);

  function switchLocale() {
    const next = locale === 'ar' ? 'en' : 'ar';
    router.push(pathname.replace(/^\/(ar|en)/, `/${next}`));
  }

  async function stopImpersonation() {
    await update({ stopImpersonation: true });
    router.push(`/${locale}/admin`);
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <h1 className="flex-1 truncate text-lg font-semibold ltr:ml-12 md:ltr:ml-0 rtl:mr-12 md:rtl:mr-0">
        {title}
      </h1>

      {impersonating ? (
        <Button variant="destructive" size="sm" onClick={stopImpersonation}>
          <ShieldOff />
          {isAr ? 'إنهاء انتحال الشخصية' : 'Stop impersonation'}
        </Button>
      ) : null}

      <Button variant="ghost" size="icon" onClick={switchLocale} aria-label="Switch language">
        <Globe />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">
                {initials(user?.name ?? user?.email ?? 'A')}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">
              {user?.email}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/${locale}/admin/settings`)}>
            <User />
            {isAr ? 'الإعدادات' : 'Settings'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={() => signOut({ callbackUrl: `/${locale}/login` })}>
            <LogOut />
            {isAr ? 'تسجيل الخروج' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

/** Shown at the top of every page while an admin is impersonating a user. */
export function ImpersonationBanner({ name }: { name: string }) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  return (
    <div className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground">
      <ShieldOff className="size-4" />
      {isAr ? `أنت تتصفح كـ ${name} — وضع الدعم الفني` : `You are browsing as ${name} — support mode`}
    </div>
  );
}

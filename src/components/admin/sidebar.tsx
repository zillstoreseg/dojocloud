'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as Icons from 'lucide-react';
import { Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminNavSection } from '@/lib/admin/nav';
import type { PendingCounts } from '@/lib/admin/counts';

interface Props {
  sections: AdminNavSection[];
  counts: PendingCounts;
  brandName: string;
}

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <Icon className={className} />;
}

export function AdminSidebar({ sections, counts, brandName }: Props) {
  const pathname = usePathname();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const [open, setOpen] = useState(false);

  // Strip the locale prefix so nav hrefs (which are locale-agnostic) compare cleanly.
  const path = pathname.replace(/^\/(ar|en)/, '') || '/';

  const nav = (
    <nav className="flex flex-col gap-6 p-4">
      {sections.map((section) => (
        <div key={section.labelEn} className="space-y-1">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            {isAr ? section.labelAr : section.labelEn}
          </p>
          {section.items.map((item) => {
            // `/admin` must not stay highlighted on every child route.
            const active = item.href === '/admin' ? path === '/admin' : path.startsWith(item.href);
            const badge = item.badgeKey
              ? item.badgeKey === 'trainers'
                ? counts.total
                : counts[item.badgeKey]
              : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn('nav-link', active && 'nav-link-active')}
              >
                <NavIcon name={item.icon} className="size-4 shrink-0" />
                <span className="flex-1 truncate">{isAr ? item.labelAr : item.labelEn}</span>
                {badge > 0 ? (
                  <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1.5 text-[11px]">
                    {badge}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile trigger */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-3 z-50 md:hidden ltr:left-3 rtl:right-3"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle navigation"
      >
        {open ? <X /> : <Menu />}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 z-40 flex w-64 flex-col border-e bg-card transition-transform md:sticky md:top-0 md:h-screen',
          'ltr:left-0 rtl:right-0',
          // The off-canvas transform is scoped to small screens; without
          // `max-md:` the RTL variant outranks `md:translate-x-0` in the
          // generated stylesheet and the sidebar stays hidden on desktop.
          open ? 'translate-x-0' : 'max-md:ltr:-translate-x-full max-md:rtl:translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center border-b px-5">
          <Link href="/admin" className="text-primary">
            <Logo name={brandName} />
          </Link>
          <Badge variant="muted" className="ms-2 text-[10px]">
            {isAr ? 'إدارة' : 'Admin'}
          </Badge>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">{nav}</div>
      </aside>
    </>
  );
}

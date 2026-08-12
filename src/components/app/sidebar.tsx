'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as Icons from 'lucide-react';
import { Lock, Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NavSection } from '@/lib/nav';

interface Props {
  sections: NavSection[];
  brandName: string;
  /** Where the logo links to — the surface's own home. */
  homeHref: string;
  /** Small label beside the logo: "Admin", "Coach". */
  roleLabel: string;
  /** Where a locked item routes instead of its own href. */
  upgradeHref?: string;
}

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <Icon className={className} />;
}

/**
 * The off-canvas-on-mobile, fixed-on-desktop sidebar used by both dashboards.
 */
export function AppSidebar({ sections, brandName, homeHref, roleLabel, upgradeHref }: Props) {
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
            const label = isAr ? item.labelAr : item.labelEn;

            // Not built yet: render inert rather than a link that 404s.
            if (item.comingSoon) {
              return (
                <span
                  key={item.href}
                  className="nav-link cursor-default opacity-50"
                  aria-disabled="true"
                >
                  <NavIcon name={item.icon} className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  <Badge variant="muted" className="shrink-0 px-1.5 text-[10px] font-normal">
                    {isAr ? 'قريبًا' : 'Soon'}
                  </Badge>
                </span>
              );
            }

            // A surface root must not stay highlighted on every child route.
            const active =
              item.href === homeHref ? path === homeHref : path.startsWith(item.href);
            const href = item.locked ? (upgradeHref ?? item.href) : item.href;

            return (
              <Link
                key={item.href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn('nav-link', active && !item.locked && 'nav-link-active')}
                title={item.locked && isAr ? 'غير متاح في خطتك الحالية' : undefined}
              >
                <NavIcon name={item.icon} className="size-4 shrink-0" />
                <span className={cn('flex-1 truncate', item.locked && 'opacity-60')}>{label}</span>
                {item.locked ? (
                  <Lock className="size-3.5 shrink-0 text-muted-foreground/70" />
                ) : item.badge ? (
                  <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1.5 text-[11px]">
                    {item.badge}
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
          <Link href={homeHref} className="text-primary">
            <Logo name={brandName} />
          </Link>
          <Badge variant="muted" className="ms-2 text-[10px]">
            {roleLabel}
          </Badge>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">{nav}</div>
      </aside>
    </>
  );
}

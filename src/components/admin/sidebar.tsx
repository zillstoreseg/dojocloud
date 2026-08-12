'use client';

import { useLocale } from 'next-intl';
import { AppSidebar } from '@/components/app/sidebar';
import type { AdminNavSection } from '@/lib/admin/nav';
import type { PendingCounts } from '@/lib/admin/counts';

/**
 * Admin flavour of the shared sidebar: it only has to turn `badgeKey` into a
 * live count. Everything visual lives in `AppSidebar`, so the trainer
 * dashboard cannot drift away from this one.
 */
export function AdminSidebar({
  sections,
  counts,
  brandName,
}: {
  sections: AdminNavSection[];
  counts: PendingCounts;
  brandName: string;
}) {
  const isAr = useLocale() === 'ar';

  const resolved = sections.map((section) => ({
    labelAr: section.labelAr,
    labelEn: section.labelEn,
    items: section.items.map((item) => ({
      href: item.href,
      labelAr: item.labelAr,
      labelEn: item.labelEn,
      icon: item.icon,
      // The activations entry aggregates every pending queue, not just trainers.
      badge: item.badgeKey
        ? item.badgeKey === 'trainers'
          ? counts.total
          : counts[item.badgeKey]
        : undefined,
    })),
  }));

  return (
    <AppSidebar
      sections={resolved}
      brandName={brandName}
      homeHref="/admin"
      roleLabel={isAr ? 'إدارة' : 'Admin'}
    />
  );
}

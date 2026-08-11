import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { visibleNav } from '@/lib/admin/nav';
import { getPendingCounts } from '@/lib/admin/counts';
import { getBrand } from '@/lib/settings';
import { AdminSidebar } from '@/components/admin/sidebar';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  // A non-admin should not learn that this route exists.
  if (!session?.user || session.user.role !== 'ADMIN') notFound();

  const [counts, brand] = await Promise.all([getPendingCounts(), getBrand()]);
  const sections = visibleNav(session.user, hasPermission);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <AdminSidebar sections={sections} counts={counts} brandName={brand.name} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

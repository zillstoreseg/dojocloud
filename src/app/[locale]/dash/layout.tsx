import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { getBrand } from '@/lib/settings';
import { resolveFlags } from '@/lib/flags';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { trainerNav } from '@/lib/trainer/nav';
import { AppSidebar } from '@/components/app/sidebar';

/**
 * The dashboard is only reachable at the `ready` stage — approved and paid.
 * Every other stage is redirected by `requireTrainerStage` to the one screen
 * that can move it forward, so no page below has to re-check.
 */
export default async function TrainerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const [brand, flags] = await Promise.all([getBrand(), resolveFlags(user.id)]);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <AppSidebar
        sections={trainerNav(flags)}
        brandName={brand.name}
        homeHref="/dash"
        roleLabel={locale === 'ar' ? 'مدرب' : 'Coach'}
        upgradeHref="/dash/billing"
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

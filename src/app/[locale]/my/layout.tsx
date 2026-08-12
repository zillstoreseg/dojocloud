import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { getBrand } from '@/lib/settings';
import { FLAG_KEYS, isFeatureEnabled } from '@/lib/flags';
import { requireTraineePage } from '@/lib/trainee/portal';
import { traineeNav } from '@/lib/trainee/nav';
import { AppSidebar } from '@/components/app/sidebar';
import { prisma } from '@/lib/prisma';

/**
 * The trainee portal shell.
 *
 * The meal scanner is a coach-plan feature used by a trainee, so its nav entry
 * is resolved against the coach's flags, not the trainee's — a trainee has no
 * plan of their own and would otherwise always fall through to the default.
 */
export default async function TraineeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);

  const coach = await prisma.trainerProfile.findUnique({
    where: { id: ctx.trainerId },
    select: { userId: true },
  });

  const [brand, canScan] = await Promise.all([
    getBrand(),
    coach ? isFeatureEnabled(coach.userId, FLAG_KEYS.AI_FOOD_SCAN) : Promise.resolve(false),
  ]);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <AppSidebar
        sections={traineeNav({ canScan })}
        brandName={brand.name}
        homeHref="/my"
        roleLabel={locale === 'ar' ? 'متدرب' : 'Trainee'}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

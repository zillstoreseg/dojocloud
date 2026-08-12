import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { decimalToNumber } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import { trackPageView, utmFrom } from '@/lib/analytics';
import { JoinWizard, type JoinPackage } from './join-wizard';

type Params = Promise<{ locale: string; username: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, username } = await params;
  const trainer = await prisma.trainerProfile.findFirst({
    where: { username: username.toLowerCase(), approvalStatus: 'APPROVED' },
    select: { fullName: true },
  });
  const isAr = locale === 'ar';
  return {
    title: trainer
      ? isAr
        ? `اشترك مع ${trainer.fullName}`
        : `Subscribe to ${trainer.fullName}`
      : 'Not found',
    // A checkout flow has no business in a search index.
    robots: { index: false, follow: false },
  };
}

/**
 * The trainee's subscribe journey: pick a package, answer the intake, review,
 * upload the receipt.
 *
 * Deliberately signed out. Asking a stranger to create an account before they
 * have decided to buy anything is where this kind of funnel loses most of its
 * people; the account is created for them when the coach's admin approves the
 * payment.
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { locale, username } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const trainer = await prisma.trainerProfile.findFirst({
    where: { username: username.toLowerCase(), approvalStatus: 'APPROVED' },
    select: {
      id: true,
      username: true,
      fullName: true,
      avatarUrl: true,
      packages: {
        where: { isActive: true, isPublic: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!trainer) notFound();

  await trackPageView({
    path: `/${locale}/join/${trainer.username}`,
    trainerId: trainer.id,
    utm: utmFrom(sp),
  });

  const settings = await getSettings('payment');
  const isAr = locale === 'ar';

  const packages: JoinPackage[] = trainer.packages.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: decimalToNumber(p.price),
    currency: p.currency,
    durationDays: p.durationDays,
    sessionsCount: p.sessionsCount,
  }));

  const preselected = (Array.isArray(sp.package) ? sp.package[0] : sp.package) ?? null;

  return (
    <main className="bg-contour min-h-dvh px-4 py-8 md:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <JoinWizard
          locale={locale}
          coach={{
            username: trainer.username,
            fullName: trainer.fullName,
            avatarUrl: trainer.avatarUrl,
          }}
          packages={packages}
          preselectedPackageId={
            preselected && packages.some((p) => p.id === preselected) ? preselected : null
          }
          payment={{
            instructions: (isAr ? settings['payment.instructions_ar'] : settings['payment.instructions_en']) ?? '',
            bankName: settings['payment.bank_name'] ?? '',
            bankAccount: settings['payment.bank_account'] ?? '',
            instapay: settings['payment.instapay'] ?? '',
            vodafoneCash: settings['payment.vodafone_cash'] ?? '',
          }}
        />
      </div>
    </main>
  );
}

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * Post-login router. Sends each role to its home surface, and holds trainers in
 * the onboarding funnel until their account is approved and a plan is active.
 */
export default async function PostLoginRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) redirect(`/${locale}/login`);

  const { role, approvalStatus } = session.user;

  if (role === 'ADMIN') redirect(`/${locale}/admin`);
  if (role === 'TRAINEE') redirect(`/${locale}/my`);

  if (role === 'TRAINER') {
    if (approvalStatus !== 'APPROVED') redirect(`/${locale}/onboarding/pending`);
    redirect(`/${locale}/dash`);
  }

  redirect(`/${locale}`);
}

import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { TrainerPage } from '@/components/trainer/page-shell';
import { SPECIALTY_KEYS, SPECIALTY_LABELS } from '@/lib/specialties';
import { USERNAME_CHANGE_COOLDOWN_DAYS } from '@/lib/username';
import { publicEnv } from '@/lib/env';
import { SettingsPanel, type ProfileValues } from './settings-panel';

export default async function TrainerSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const profile = await prisma.trainerProfile.findUnique({
    where: { id: user.trainerId },
    select: {
      username: true,
      usernameChangedAt: true,
      fullName: true,
      phone: true,
      city: true,
      country: true,
      bio: true,
      avatarUrl: true,
      yearsExperience: true,
      specialties: true,
      trainsGenders: true,
      socialLinks: true,
      isListed: true,
    },
  });
  if (!profile) return null;

  const social = (profile.socialLinks ?? {}) as Record<string, string | null>;

  const values: ProfileValues = {
    fullName: profile.fullName,
    phone: profile.phone,
    city: profile.city ?? '',
    bio: profile.bio ?? '',
    yearsExperience: profile.yearsExperience,
    specialties: profile.specialties,
    trainsGenders: profile.trainsGenders,
    instagram: social.instagram ?? '',
    tiktok: social.tiktok ?? '',
    youtube: social.youtube ?? '',
    whatsapp: social.whatsapp ?? '',
  };

  // How long until they may change their handle again, so the screen can say
  // so up front rather than refusing after they have typed a new one.
  const cooldownDaysLeft = profile.usernameChangedAt
    ? Math.max(
        0,
        Math.ceil(
          (profile.usernameChangedAt.getTime() +
            USERNAME_CHANGE_COOLDOWN_DAYS * 864e5 -
            Date.now()) /
            864e5,
        ),
      )
    : 0;

  return (
    <TrainerPage
      title={isAr ? 'الإعدادات' : 'Settings'}
      description={
        isAr
          ? 'البيانات دي هي اللي الزوار بيشوفوها في الدليل وفي صفحتك، فخلي بالك منها.'
          : 'This is what visitors see in the directory and on your page.'
      }
    >
      <SettingsPanel
        locale={locale}
        values={values}
        email={user.email ?? ''}
        username={profile.username}
        avatarUrl={profile.avatarUrl}
        country={profile.country}
        isListed={profile.isListed}
        cooldownDaysLeft={cooldownDaysLeft}
        pageUrlBase={`${publicEnv.appUrl.replace(/\/$/, '')}/${locale}/c/`}
        specialties={SPECIALTY_KEYS.map((key) => ({
          value: key,
          label: SPECIALTY_LABELS[key][isAr ? 'ar' : 'en'],
        }))}
      />
    </TrainerPage>
  );
}

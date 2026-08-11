import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { AdminPage } from '@/components/admin/page-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { FlagList, type FlagView } from './flag-list';

export default async function AdminFlagsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('flags.write', locale);

  const isAr = locale === 'ar';

  const flags = await prisma.featureFlag.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { planFeatures: true } },
      userOverrides: {
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });

  const views: FlagView[] = flags.map((flag) => ({
    key: flag.key,
    name: flag.name,
    description: flag.description,
    type: flag.type,
    defaultEnabled: flag.defaultEnabled,
    defaultLimit: flag.defaultLimit,
    category: flag.category,
    isKillSwitch: flag.isKillSwitch,
    planCount: flag._count.planFeatures,
    overrides: flag.userOverrides.map((o) => ({
      userId: o.user.id,
      email: o.user.email,
      enabled: o.enabled,
      limitValue: o.limitValue,
      reason: o.reason,
    })),
  }));

  return (
    <AdminPage
      title={isAr ? 'الميزات (Feature Flags)' : 'Feature flags'}
      description={
        isAr
          ? 'تحكّم في أي ميزة، لكل خطة أو لمستخدم بعينه، بدون نشر إصدار جديد.'
          : 'Control any feature, per plan or per user, without shipping a release.'
      }
    >
      <Alert variant="info">
        <Info />
        <div>
          <AlertTitle>{isAr ? 'كيف تُحسم القيمة' : 'How a value is resolved'}</AlertTitle>
          <AlertDescription>
            {isAr
              ? 'الافتراضي العام ← إعداد الخطة ← استثناء المستخدم؛ آخر طبقة تفوز. أما «مفتاح الإيقاف» فيتفوق على الجميع عند إطفائه.'
              : 'Global default → plan setting → user override; the last layer wins. A kill switch, when off, beats them all.'}
          </AlertDescription>
        </div>
      </Alert>

      <FlagList flags={views} />
    </AdminPage>
  );
}

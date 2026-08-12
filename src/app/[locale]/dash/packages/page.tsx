import { setRequestLocale } from 'next-intl/server';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { formatMoney, decimalToNumber, SUPPORTED_CURRENCIES } from '@/lib/money';
import { currencyForCountry } from '@/lib/countries';
import { TrainerPage } from '@/components/trainer/page-shell';
import { PackageList, type PackageCard } from './package-list';

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const [rows, profile] = await Promise.all([
    prisma.trainerPackage.findMany({
      where: { trainerId: user.trainerId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { subscriptions: true } } },
    }),
    prisma.trainerProfile.findUnique({
      where: { id: user.trainerId },
      select: { country: true },
    }),
  ]);

  const cards: PackageCard[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    price: decimalToNumber(row.price),
    currency: row.currency as PackageCard['currency'],
    durationDays: row.durationDays,
    sessionsCount: row.sessionsCount,
    isPublic: row.isPublic,
    isActive: row.isActive,
    priceLabel: formatMoney(decimalToNumber(row.price), row.currency, locale),
    subscriberCount: row._count.subscriptions,
  }));

  return (
    <TrainerPage
      title={isAr ? 'باقاتي' : 'My packages'}
      description={
        isAr
          ? 'الباقات دي هي اللي المتدرب هيختار منها لما يشترك معاك — من صفحتك أو من الدليل.'
          : 'These are what a trainee picks from when subscribing with you — from your page or the directory.'
      }
    >
      <PackageList
        rows={cards}
        currencies={[...SUPPORTED_CURRENCIES]}
        defaultCurrency={currencyForCountry(profile?.country ?? 'EG')}
        labels={
          isAr
            ? {
                add: 'أضف باقة',
                addTitle: 'باقة جديدة',
                editTitle: 'تعديل الباقة',
                formSubtitle: 'حدّد السعر والمدة، والمتدرب يشترك بيها مباشرة.',
                name: 'اسم الباقة',
                price: 'السعر',
                currency: 'العملة',
                duration: 'المدة (بالأيام)',
                sessionsCount: 'عدد الجلسات',
                sessionsHint: 'اختياري',
                description: 'الوصف',
                isPublic: 'اعرضها على صفحتي',
                isPublicHint: 'لو مقفولة، تقدر تشترك بيها المتدربين يدويًا فقط',
                isActive: 'الباقة مفعّلة',
                public: 'ظاهرة',
                private: 'مخفية',
                durationDays: '{days} يوم',
                sessions: '{n} جلسة',
                subscribers: '{n} مشترك',
                edit: 'تعديل',
                delete: 'حذف',
                save: 'حفظ',
                cancel: 'إلغاء',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
                confirmDelete: 'حذف باقة «{name}»؟',
                confirmDeactivate:
                  'فيه مشتركين في «{name}»، فهتتوقف بدل ما تتحذف عشان اشتراكاتهم ما تضيعش. تمام؟',
                emptyTitle: 'لسه مفيش باقات',
                emptyDescription: 'أضف أول باقة عشان المتدربين يقدروا يشتركوا معاك.',
              }
            : {
                add: 'Add package',
                addTitle: 'New package',
                editTitle: 'Edit package',
                formSubtitle: 'Set the price and duration; trainees subscribe to it directly.',
                name: 'Package name',
                price: 'Price',
                currency: 'Currency',
                duration: 'Duration (days)',
                sessionsCount: 'Sessions',
                sessionsHint: 'Optional',
                description: 'Description',
                isPublic: 'Show on my page',
                isPublicHint: 'When off, you can still subscribe trainees to it manually',
                isActive: 'Package is active',
                public: 'Visible',
                private: 'Hidden',
                durationDays: '{days} days',
                sessions: '{n} sessions',
                subscribers: '{n} subscribers',
                edit: 'Edit',
                delete: 'Delete',
                save: 'Save',
                cancel: 'Cancel',
                generic: 'Something went wrong, please try again',
                confirmDelete: 'Delete the “{name}” package?',
                confirmDeactivate:
                  '“{name}” has subscribers, so it will be deactivated rather than deleted to keep their subscriptions intact. Continue?',
                emptyTitle: 'No packages yet',
                emptyDescription: 'Add your first package so trainees can subscribe with you.',
              }
        }
      />
    </TrainerPage>
  );
}

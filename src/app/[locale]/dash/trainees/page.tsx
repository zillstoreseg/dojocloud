import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { getQuota, QUOTA_KEYS } from '@/lib/quota';
import { parseListParams, paginationArgs, orderByArgs, pageMeta } from '@/lib/list-params';
import { daysRemaining } from '@/lib/billing';
import { formatNumber } from '@/lib/money';
import {
  GOAL_LABELS,
  ACTIVITY_LABELS,
  TRAINEE_STATUS_LABELS,
  label as pickLabel,
} from '@/lib/training';
import { TrainerPage } from '@/components/trainer/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination } from '@/components/data-table/pagination';
import { Badge } from '@/components/ui/badge';
import { TraineeList, type TraineeRow } from './trainee-list';

const SORTABLE = ['fullName', 'createdAt', 'renewalDate', 'status'] as const;

export default async function TraineesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const listParams = parseListParams(sp, { defaultSort: 'createdAt' });

  // Every filter is composed onto a `trainerId` drawn from the session, so no
  // combination of query params can widen the result beyond this trainer.
  const where: Prisma.TraineeWhereInput = {
    trainerId: user.trainerId,
    ...(listParams.q
      ? {
          OR: [
            { fullName: { contains: listParams.q, mode: 'insensitive' as const } },
            { phone: { contains: listParams.q } },
            { email: { contains: listParams.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(listParams.filters.status ? { status: listParams.filters.status as never } : {}),
    ...(listParams.filters.goal ? { goal: listParams.filters.goal as never } : {}),
  };

  const [total, rows, totalOwned, quota] = await Promise.all([
    prisma.trainee.count({ where }),
    prisma.trainee.findMany({
      where,
      orderBy: orderByArgs(listParams, SORTABLE),
      ...paginationArgs(listParams),
    }),
    prisma.trainee.count({ where: { trainerId: user.trainerId } }),
    getQuota(user.trainerId, QUOTA_KEYS.TRAINEES),
  ]);

  const toIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

  const listRows: TraineeRow[] = rows.map((row) => {
    const renewalIn = row.renewalDate ? daysRemaining(row.renewalDate) : null;
    return {
      id: row.id,
      fullName: row.fullName,
      phone: row.phone ?? '',
      email: row.email ?? '',
      gender: row.gender ?? null,
      birthDate: toIso(row.birthDate),
      heightCm: row.heightCm ? Number(row.heightCm) : null,
      startWeightKg: row.startWeightKg ? Number(row.startWeightKg) : null,
      goal: row.goal ?? null,
      activityLevel: row.activityLevel ?? null,
      medicalNotes: row.medicalNotes ?? '',
      injuries: row.injuries ?? '',
      notes: row.notes ?? '',
      renewalDate: toIso(row.renewalDate),
      status: row.status,
      statusLabel: pickLabel(TRAINEE_STATUS_LABELS, row.status, locale),
      goalLabel: pickLabel(GOAL_LABELS, row.goal, locale),
      renewalIn,
      renewalLabel:
        renewalIn === null
          ? null
          : renewalIn === 0
            ? isAr
              ? 'اليوم'
              : 'Today'
            : isAr
              ? `بعد ${formatNumber(renewalIn, locale)} يوم`
              : `in ${renewalIn} days`,
    };
  });

  const meta = pageMeta(listParams, total);

  return (
    <TrainerPage
      title={isAr ? 'المتدربون' : 'Trainees'}
      description={
        isAr
          ? 'كل متدرب وهدفه وبرنامجه وميعاد تجديده في مكان واحد.'
          : 'Every trainee, their goal, their program and their renewal date in one place.'
      }
      actions={
        quota.limit !== null ? (
          <Badge variant={quota.exceeded ? 'destructive' : quota.percent >= 80 ? 'warning' : 'muted'}>
            {formatNumber(quota.used, locale)} / {formatNumber(quota.limit, locale)}{' '}
            {isAr ? 'من خطتك' : 'of your plan'}
          </Badge>
        ) : null
      }
    >
      <DataTableToolbar
        searchPlaceholder={isAr ? 'ابحث بالاسم أو الهاتف' : 'Search by name or phone'}
        filters={[
          {
            key: 'status',
            label: isAr ? 'الحالة' : 'Status',
            options: Object.keys(TRAINEE_STATUS_LABELS).map((value) => ({
              value,
              label: pickLabel(TRAINEE_STATUS_LABELS, value, locale),
            })),
          },
          {
            key: 'goal',
            label: isAr ? 'الهدف' : 'Goal',
            options: Object.keys(GOAL_LABELS).map((value) => ({
              value,
              label: pickLabel(GOAL_LABELS, value, locale),
            })),
          },
        ]}
      />

      <TraineeList
        rows={listRows}
        isEmpty={totalOwned === 0}
        options={{
          goals: Object.keys(GOAL_LABELS).map((value) => ({
            value,
            label: pickLabel(GOAL_LABELS, value, locale),
          })),
          activity: Object.keys(ACTIVITY_LABELS).map((value) => ({
            value,
            label: pickLabel(ACTIVITY_LABELS, value, locale),
          })),
        }}
        labels={
          isAr
            ? {
                add: 'أضف متدرب',
                addTitle: 'متدرب جديد',
                editTitle: 'تعديل بيانات المتدرب',
                subtitle: 'البيانات دي هي أساس حساب سعراته وبرنامجه.',
                fullName: 'الاسم بالكامل',
                gender: 'النوع',
                male: 'ذكر',
                female: 'أنثى',
                phone: 'رقم الهاتف',
                email: 'البريد الإلكتروني',
                emailHint: 'اختياري — يلزم فقط لو هتفتحله حساب دخول',
                birthDate: 'تاريخ الميلاد',
                height: 'الطول (سم)',
                weight: 'الوزن (كجم)',
                goal: 'الهدف',
                goalHint: 'الهدف بيحدد السعرات والماكروز',
                activity: 'مستوى النشاط',
                renewalDate: 'ميعاد التجديد',
                renewalHint: 'هينبّهك قبلها بأسبوع',
                injuries: 'إصابات',
                medical: 'ملاحظات طبية',
                notes: 'ملاحظات',
                save: 'حفظ',
                cancel: 'إلغاء',
                upgrade: 'رقّي خطتك',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
                colName: 'المتدرب',
                colGoal: 'الهدف',
                colStatus: 'الحالة',
                colRenewal: 'التجديد',
                actions: 'إجراءات',
                edit: 'تعديل',
                activate: 'تفعيل',
                pause: 'إيقاف مؤقت',
                archive: 'أرشفة',
                delete: 'حذف',
                confirmDelete: 'حذف {name} نهائيًا؟ هيتشال معاه برنامجه وقياساته.',
                emptyTitle: 'لسه مفيش متدربين',
                emptyDescription: 'أضف أول متدرب، وابدأ تبنيله برنامج ونظام غذائي.',
                noMatches: 'لا توجد نتائج مطابقة',
              }
            : {
                add: 'Add trainee',
                addTitle: 'New trainee',
                editTitle: 'Edit trainee',
                subtitle: 'These details drive their calorie target and program.',
                fullName: 'Full name',
                gender: 'Gender',
                male: 'Male',
                female: 'Female',
                phone: 'Phone',
                email: 'Email',
                emailHint: 'Optional — only needed to give them a login',
                birthDate: 'Date of birth',
                height: 'Height (cm)',
                weight: 'Weight (kg)',
                goal: 'Goal',
                goalHint: 'The goal drives calories and macros',
                activity: 'Activity level',
                renewalDate: 'Renewal date',
                renewalHint: 'You will be reminded a week before',
                injuries: 'Injuries',
                medical: 'Medical notes',
                notes: 'Notes',
                save: 'Save',
                cancel: 'Cancel',
                upgrade: 'Upgrade',
                generic: 'Something went wrong, please try again',
                colName: 'Trainee',
                colGoal: 'Goal',
                colStatus: 'Status',
                colRenewal: 'Renewal',
                actions: 'Actions',
                edit: 'Edit',
                activate: 'Activate',
                pause: 'Pause',
                archive: 'Archive',
                delete: 'Delete',
                confirmDelete: 'Delete {name} permanently? Their program and measurements go too.',
                emptyTitle: 'No trainees yet',
                emptyDescription: 'Add your first trainee and start building their program.',
                noMatches: 'No matching results',
              }
        }
      />

      {total > 0 ? <DataTablePagination meta={meta} /> : null}
    </TrainerPage>
  );
}

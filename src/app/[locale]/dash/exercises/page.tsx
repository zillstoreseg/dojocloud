import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { getQuota, QUOTA_KEYS } from '@/lib/quota';
import { parseListParams } from '@/lib/list-params';
import { formatNumber } from '@/lib/money';
import {
  MUSCLE_GROUP_LABELS,
  EQUIPMENT_LABELS,
  DIFFICULTY_LABELS,
  label as pickLabel,
} from '@/lib/training';
import { TrainerPage } from '@/components/trainer/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { Badge } from '@/components/ui/badge';
import { ExerciseLibrary, type ExerciseCard } from './exercise-library';

/** Cards are compact, so a page holds more of them than a table row would. */
const PER_SIDE = 60;

export default async function ExercisesPage({
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
  const listParams = parseListParams(sp);

  // Search and filters apply to both libraries, so switching tabs keeps the
  // same question in view rather than resetting it.
  const common: Prisma.ExerciseWhereInput = {
    isActive: true,
    ...(listParams.q
      ? {
          OR: [
            { nameAr: { contains: listParams.q, mode: 'insensitive' as const } },
            { nameEn: { contains: listParams.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(listParams.filters.muscleGroup
      ? { muscleGroup: listParams.filters.muscleGroup as never }
      : {}),
    ...(listParams.filters.equipment ? { equipment: listParams.filters.equipment as never } : {}),
  };

  const [mineRows, sharedRows, quota] = await Promise.all([
    prisma.exercise.findMany({
      where: { ...common, trainerId: user.trainerId },
      orderBy: { createdAt: 'desc' },
      take: PER_SIDE,
    }),
    prisma.exercise.findMany({
      where: { ...common, isPublic: true, trainerId: null },
      orderBy: { nameAr: 'asc' },
      take: PER_SIDE,
    }),
    getQuota(user.trainerId, QUOTA_KEYS.EXERCISES),
  ]);

  const toCard = (row: (typeof mineRows)[number]): ExerciseCard => ({
    id: row.id,
    isMine: row.trainerId !== null,
    name: isAr ? row.nameAr : row.nameEn,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    muscleGroup: row.muscleGroup,
    equipment: row.equipment,
    difficulty: row.difficulty,
    videoUrl: row.videoUrl ?? '',
    instructionsAr: row.instructionsAr ?? '',
    instructionsEn: row.instructionsEn ?? '',
    muscleLabel: pickLabel(MUSCLE_GROUP_LABELS, row.muscleGroup, locale),
    equipmentLabel: pickLabel(EQUIPMENT_LABELS, row.equipment, locale),
    difficultyLabel: pickLabel(DIFFICULTY_LABELS, row.difficulty, locale),
  });

  const options = (map: Record<string, { ar: string; en: string }>) =>
    Object.keys(map).map((value) => ({ value, label: pickLabel(map, value, locale) }));

  return (
    <TrainerPage
      title={isAr ? 'التمارين' : 'Exercises'}
      description={
        isAr
          ? 'مكتبتك الخاصة، والمكتبة العامة اللي تقدر تنسخ منها وتعدّل.'
          : 'Your own library, plus the shared one you can copy from and adjust.'
      }
      actions={
        quota.limit !== null ? (
          <Badge variant={quota.exceeded ? 'destructive' : quota.percent >= 80 ? 'warning' : 'muted'}>
            {formatNumber(quota.used, locale)} / {formatNumber(quota.limit, locale)}
          </Badge>
        ) : null
      }
    >
      <DataTableToolbar
        searchPlaceholder={isAr ? 'ابحث عن تمرين' : 'Search exercises'}
        filters={[
          {
            key: 'muscleGroup',
            label: isAr ? 'العضلة' : 'Muscle',
            options: options(MUSCLE_GROUP_LABELS),
          },
          {
            key: 'equipment',
            label: isAr ? 'الأدوات' : 'Equipment',
            options: options(EQUIPMENT_LABELS),
          },
        ]}
      />

      <ExerciseLibrary
        mine={mineRows.map(toCard)}
        shared={sharedRows.map(toCard)}
        options={{
          muscles: options(MUSCLE_GROUP_LABELS),
          equipment: options(EQUIPMENT_LABELS),
          difficulty: options(DIFFICULTY_LABELS),
        }}
        labels={
          isAr
            ? {
                tabMine: 'مكتبتي',
                tabShared: 'المكتبة العامة',
                add: 'أضف تمرين',
                addTitle: 'تمرين جديد',
                editTitle: 'تعديل التمرين',
                formSubtitle: 'التمارين دي هي اللي هتبني منها برامج متدربيك.',
                nameAr: 'الاسم بالعربي',
                nameEn: 'الاسم بالإنجليزي',
                muscleGroup: 'العضلة المستهدفة',
                equipment: 'الأدوات',
                difficulty: 'المستوى',
                videoUrl: 'رابط فيديو',
                videoHint: 'اختياري — يوتيوب أو أي رابط مباشر',
                instructions: 'تعليمات الأداء',
                watch: 'شاهد الفيديو',
                edit: 'تعديل',
                delete: 'حذف',
                copyToMine: 'انسخ لمكتبتي',
                save: 'حفظ',
                cancel: 'إلغاء',
                upgrade: 'رقّي خطتك',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
                confirmDelete: 'حذف «{name}»؟',
                emptyMineTitle: 'مكتبتك فاضية',
                emptyMineDescription: 'أضف تمارينك، أو انسخ من المكتبة العامة وعدّل عليها.',
                emptySharedTitle: 'مفيش نتائج في المكتبة العامة',
                emptySharedDescription: 'جرّب تغيّر البحث أو الفلاتر.',
              }
            : {
                tabMine: 'My library',
                tabShared: 'Shared library',
                add: 'Add exercise',
                addTitle: 'New exercise',
                editTitle: 'Edit exercise',
                formSubtitle: 'These are what you build your trainees’ programs from.',
                nameAr: 'Arabic name',
                nameEn: 'English name',
                muscleGroup: 'Target muscle',
                equipment: 'Equipment',
                difficulty: 'Level',
                videoUrl: 'Video link',
                videoHint: 'Optional — YouTube or any direct link',
                instructions: 'Coaching cues',
                watch: 'Watch video',
                edit: 'Edit',
                delete: 'Delete',
                copyToMine: 'Copy to mine',
                save: 'Save',
                cancel: 'Cancel',
                upgrade: 'Upgrade',
                generic: 'Something went wrong, please try again',
                confirmDelete: 'Delete “{name}”?',
                emptyMineTitle: 'Your library is empty',
                emptyMineDescription: 'Add your own, or copy from the shared library and adjust.',
                emptySharedTitle: 'No matches in the shared library',
                emptySharedDescription: 'Try a different search or filter.',
              }
        }
      />
    </TrainerPage>
  );
}

import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, orderByArgs, pageMeta } from '@/lib/list-params';
import {
  MUSCLE_GROUP_LABELS,
  EQUIPMENT_LABELS,
  DIFFICULTY_LABELS,
  label as pickLabel,
} from '@/lib/training';
import { AdminPage, AdminTableCard } from '@/components/admin/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination, SortableHeader } from '@/components/data-table/pagination';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const SORTABLE = ['nameAr', 'nameEn', 'muscleGroup', 'createdAt'] as const;

export default async function AdminExerciseLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('library.write', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { defaultSort: 'nameAr', defaultDir: 'asc' });

  // Default view is the shared library the admin curates; `owner=trainers`
  // switches to what coaches have added privately.
  const owner = listParams.filters.owner ?? 'platform';
  const where: Prisma.ExerciseWhereInput = {
    ...(owner === 'trainers' ? { trainerId: { not: null } } : { trainerId: null }),
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
  };

  const [total, rows] = await Promise.all([
    prisma.exercise.count({ where }),
    prisma.exercise.findMany({
      where,
      orderBy: orderByArgs(listParams, SORTABLE, { nameAr: 'asc' }),
      ...paginationArgs(listParams),
      include: { trainer: { select: { fullName: true } } },
    }),
  ]);

  const meta = pageMeta(listParams, total);
  const options = (map: Record<string, { ar: string; en: string }>) =>
    Object.keys(map).map((value) => ({ value, label: pickLabel(map, value, locale) }));

  return (
    <AdminPage
      title={isAr ? 'مكتبة التمارين' : 'Exercise library'}
      description={
        isAr
          ? 'المكتبة العامة اللي كل المدربين بيبنوا منها، وتمارينهم الخاصة.'
          : 'The shared library every coach builds from, plus their private ones.'
      }
    >
      <DataTableToolbar
        searchPlaceholder={isAr ? 'ابحث عن تمرين' : 'Search exercises'}
        filters={[
          {
            key: 'owner',
            label: isAr ? 'المصدر' : 'Source',
            options: [
              { value: 'platform', label: isAr ? 'المكتبة العامة' : 'Shared library' },
              { value: 'trainers', label: isAr ? 'تمارين المدربين' : 'Coach-owned' },
            ],
          },
          {
            key: 'muscleGroup',
            label: isAr ? 'العضلة' : 'Muscle',
            options: options(MUSCLE_GROUP_LABELS),
          },
        ]}
      />

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader field="nameAr">{isAr ? 'التمرين' : 'Exercise'}</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader field="muscleGroup">{isAr ? 'العضلة' : 'Muscle'}</SortableHeader>
              </TableHead>
              <TableHead>{isAr ? 'الأدوات' : 'Equipment'}</TableHead>
              <TableHead>{isAr ? 'المستوى' : 'Level'}</TableHead>
              <TableHead>{isAr ? 'المالك' : 'Owner'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={5}>{isAr ? 'لا توجد نتائج' : 'No results'}</TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{isAr ? row.nameAr : row.nameEn}</p>
                    <p className="text-xs text-muted-foreground" dir={isAr ? 'ltr' : 'rtl'}>
                      {isAr ? row.nameEn : row.nameAr}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {pickLabel(MUSCLE_GROUP_LABELS, row.muscleGroup, locale)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pickLabel(EQUIPMENT_LABELS, row.equipment, locale)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pickLabel(DIFFICULTY_LABELS, row.difficulty, locale)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.trainer ? (
                      <span className="text-muted-foreground">{row.trainer.fullName}</span>
                    ) : (
                      <Badge variant="muted">{isAr ? 'المنصة' : 'Platform'}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </AdminTableCard>

      <DataTablePagination meta={meta} />
    </AdminPage>
  );
}

import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, orderByArgs, pageMeta } from '@/lib/list-params';
import { GOAL_LABELS, TRAINEE_STATUS_LABELS, label as pickLabel } from '@/lib/training';
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

const SORTABLE = ['fullName', 'createdAt', 'renewalDate', 'status'] as const;

export default async function AdminTraineesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('trainees.read', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { defaultSort: 'createdAt' });

  // Admin sees across tenants by design; the permission check above is what
  // gates it, not a trainer filter.
  const where: Prisma.TraineeWhereInput = {
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

  const [total, rows] = await Promise.all([
    prisma.trainee.count({ where }),
    prisma.trainee.findMany({
      where,
      orderBy: orderByArgs(listParams, SORTABLE),
      ...paginationArgs(listParams),
      include: { trainer: { select: { fullName: true, username: true } } },
    }),
  ]);

  const meta = pageMeta(listParams, total);
  const dateFmt = isAr ? 'ar-EG-u-nu-latn' : 'en-US';

  return (
    <AdminPage
      title={isAr ? 'المتدربون' : 'Trainees'}
      description={
        isAr
          ? 'كل متدربي المنصة، ومع أي مدرب.'
          : 'Every trainee on the platform, and which coach they belong to.'
      }
    >
      <DataTableToolbar
        searchPlaceholder={isAr ? 'ابحث بالاسم أو الهاتف' : 'Search by name or phone'}
        exportEntity="trainees"
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

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader field="fullName">{isAr ? 'المتدرب' : 'Trainee'}</SortableHeader>
              </TableHead>
              <TableHead>{isAr ? 'المدرب' : 'Coach'}</TableHead>
              <TableHead>{isAr ? 'الهدف' : 'Goal'}</TableHead>
              <TableHead>
                <SortableHeader field="status">{isAr ? 'الحالة' : 'Status'}</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader field="renewalDate">{isAr ? 'التجديد' : 'Renewal'}</SortableHeader>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={5}>{isAr ? 'لا توجد نتائج' : 'No results'}</TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.fullName}</p>
                    {row.phone ? (
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {row.phone}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{row.trainer.fullName}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      /c/{row.trainer.username}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pickLabel(GOAL_LABELS, row.goal, locale)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === 'ACTIVE'
                          ? 'success'
                          : row.status === 'PAUSED'
                            ? 'warning'
                            : 'muted'
                      }
                    >
                      {pickLabel(TRAINEE_STATUS_LABELS, row.status, locale)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                    {row.renewalDate ? row.renewalDate.toLocaleDateString(dateFmt) : '—'}
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

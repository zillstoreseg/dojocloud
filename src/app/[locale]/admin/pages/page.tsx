import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { ExternalLink } from 'lucide-react';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, orderByArgs, pageMeta } from '@/lib/list-params';
import { formatNumber } from '@/lib/money';
import { AdminPage, AdminTableCard } from '@/components/admin/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination, SortableHeader } from '@/components/data-table/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageModeration } from './moderation';

const SORTABLE = ['title', 'status', 'viewsCount', 'leadsCount', 'publishedAt'] as const;

/**
 * Every published coach page in one list.
 *
 * Coach pages are the only trainer-authored content strangers see, so the
 * admin needs a way to find one and take it down — that is what this screen
 * exists for, alongside seeing which pages actually convert.
 */
export default async function AdminPagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('pages.read', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { defaultSort: 'viewsCount', defaultDir: 'desc' });

  const where: Prisma.LandingPageWhereInput = {
    ...(listParams.q
      ? {
          OR: [
            { title: { contains: listParams.q, mode: 'insensitive' as const } },
            { trainer: { fullName: { contains: listParams.q, mode: 'insensitive' as const } } },
            { trainer: { username: { contains: listParams.q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(listParams.filters.status ? { status: listParams.filters.status as never } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.landingPage.count({ where }),
    prisma.landingPage.findMany({
      where,
      orderBy: orderByArgs(listParams, SORTABLE, { viewsCount: 'desc' }),
      ...paginationArgs(listParams),
      include: {
        trainer: { select: { fullName: true, username: true } },
        _count: { select: { blocks: true } },
      },
    }),
  ]);

  const meta = pageMeta(listParams, total);
  const dateFmt = isAr ? 'ar-EG-u-nu-latn' : 'en-US';

  return (
    <AdminPage
      title={isAr ? 'صفحات المدربين' : 'Coach pages'}
      description={
        isAr
          ? 'كل صفحات الهبوط، بأدائها، مع إمكانية إخفاء أي صفحة مخالفة.'
          : 'Every landing page, how it performs, and a way to take one down.'
      }
    >
      <DataTableToolbar
        searchPlaceholder={isAr ? 'ابحث بالمدرب أو العنوان' : 'Search by coach or title'}
        filters={[
          {
            key: 'status',
            label: isAr ? 'الحالة' : 'Status',
            options: [
              { value: 'PUBLISHED', label: isAr ? 'منشورة' : 'Published' },
              { value: 'DRAFT', label: isAr ? 'مسودة' : 'Draft' },
              { value: 'HIDDEN', label: isAr ? 'مخفية' : 'Archived' },
            ],
          },
        ]}
      />

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader field="title">{isAr ? 'الصفحة' : 'Page'}</SortableHeader>
              </TableHead>
              <TableHead>{isAr ? 'المدرب' : 'Coach'}</TableHead>
              <TableHead>
                <SortableHeader field="status">{isAr ? 'الحالة' : 'Status'}</SortableHeader>
              </TableHead>
              <TableHead className="text-end">
                <SortableHeader field="viewsCount">{isAr ? 'زيارات' : 'Views'}</SortableHeader>
              </TableHead>
              <TableHead className="text-end">
                <SortableHeader field="leadsCount">{isAr ? 'عملاء' : 'Leads'}</SortableHeader>
              </TableHead>
              <TableHead className="text-end">{isAr ? 'التحويل' : 'Conv.'}</TableHead>
              <TableHead>{isAr ? 'النشر' : 'Published'}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>{isAr ? 'لا توجد نتائج' : 'No results'}</TableEmpty>
            ) : (
              rows.map((row) => {
                const rate = row.viewsCount > 0 ? row.leadsCount / row.viewsCount : 0;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {isAr
                          ? `${formatNumber(row._count.blocks, locale)} بلوك`
                          : `${row._count.blocks} blocks`}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{row.trainer.fullName}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        /c/{row.trainer.username}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === 'PUBLISHED'
                            ? 'success'
                            : row.status === 'HIDDEN'
                              ? 'destructive'
                              : 'muted'
                        }
                      >
                        {row.status === 'PUBLISHED'
                          ? isAr
                            ? 'منشورة'
                            : 'Live'
                          : row.status === 'HIDDEN'
                            ? isAr
                              ? 'مخفية'
                              : 'Archived'
                            : isAr
                              ? 'مسودة'
                              : 'Draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(row.viewsCount, locale)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(row.leadsCount, locale)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {Math.round(rate * 100)}%
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      {row.publishedAt ? row.publishedAt.toLocaleDateString(dateFmt) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {row.status === 'PUBLISHED' ? (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={`/${locale}/c/${row.trainer.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={isAr ? 'افتح' : 'Open'}
                            >
                              <ExternalLink />
                            </a>
                          </Button>
                        ) : null}
                        <PageModeration id={row.id} status={row.status} isAr={isAr} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </AdminTableCard>

      <DataTablePagination meta={meta} />
    </AdminPage>
  );
}

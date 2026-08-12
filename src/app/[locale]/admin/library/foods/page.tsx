import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, orderByArgs, pageMeta } from '@/lib/list-params';
import { decimalToNumber, formatNumber } from '@/lib/money';
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

const SORTABLE = ['nameAr', 'kcal', 'protein', 'createdAt'] as const;

export default async function AdminFoodLibraryPage({
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

  const where: Prisma.FoodItemWhereInput = {
    ...(listParams.q
      ? {
          OR: [
            { nameAr: { contains: listParams.q, mode: 'insensitive' as const } },
            { nameEn: { contains: listParams.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(listParams.filters.category ? { category: listParams.filters.category } : {}),
  };

  const [total, rows, categories] = await Promise.all([
    prisma.foodItem.count({ where }),
    prisma.foodItem.findMany({
      where,
      orderBy: orderByArgs(listParams, SORTABLE, { nameAr: 'asc' }),
      ...paginationArgs(listParams),
    }),
    // Categories are free text on the model, so the filter offers whatever
    // actually exists rather than a hardcoded list that can drift.
    prisma.foodItem.findMany({
      where: { category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    }),
  ]);

  const meta = pageMeta(listParams, total);

  return (
    <AdminPage
      title={isAr ? 'مكتبة الأطعمة' : 'Food library'}
      description={
        isAr
          ? 'القيم الغذائية اللي بتتحسب منها أنظمة التغذية وتحليل صور الأكل.'
          : 'The nutrition values that drive meal plans and, later, food-photo analysis.'
      }
    >
      <DataTableToolbar
        searchPlaceholder={isAr ? 'ابحث عن صنف' : 'Search foods'}
        filters={[
          {
            key: 'category',
            label: isAr ? 'التصنيف' : 'Category',
            options: categories
              .map((c) => c.category)
              .filter((c): c is string => Boolean(c))
              .map((value) => ({ value, label: value })),
          },
        ]}
      />

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader field="nameAr">{isAr ? 'الصنف' : 'Food'}</SortableHeader>
              </TableHead>
              <TableHead>{isAr ? 'الكمية المرجعية' : 'Per'}</TableHead>
              <TableHead className="text-end">
                <SortableHeader field="kcal">{isAr ? 'سعرات' : 'kcal'}</SortableHeader>
              </TableHead>
              <TableHead className="text-end">
                <SortableHeader field="protein">{isAr ? 'بروتين' : 'Protein'}</SortableHeader>
              </TableHead>
              <TableHead className="text-end">{isAr ? 'كارب' : 'Carbs'}</TableHead>
              <TableHead className="text-end">{isAr ? 'دهون' : 'Fat'}</TableHead>
              <TableHead>{isAr ? 'التصنيف' : 'Category'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>{isAr ? 'لا توجد نتائج' : 'No results'}</TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{isAr ? row.nameAr : row.nameEn}</p>
                    <p className="text-xs text-muted-foreground" dir={isAr ? 'ltr' : 'rtl'}>
                      {isAr ? row.nameEn : row.nameAr}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                    {formatNumber(decimalToNumber(row.baseQty), locale)} {row.unit}
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {formatNumber(decimalToNumber(row.kcal), locale)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {formatNumber(decimalToNumber(row.protein), locale)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {formatNumber(decimalToNumber(row.carbs), locale)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {formatNumber(decimalToNumber(row.fat), locale)}
                  </TableCell>
                  <TableCell>
                    {row.category ? (
                      <Badge variant="muted" className="font-normal">
                        {row.category}
                      </Badge>
                    ) : (
                      '—'
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

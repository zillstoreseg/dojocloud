import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, dateRangeArgs, pageMeta } from '@/lib/list-params';
import { AdminPage, AdminTableCard } from '@/components/admin/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination } from '@/components/data-table/pagination';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdminPage('audit.read', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { perPage: 50 });

  const where: Prisma.AuditLogWhereInput = {
    ...(listParams.q
      ? {
          OR: [
            { action: { contains: listParams.q, mode: 'insensitive' } },
            { entity: { contains: listParams.q, mode: 'insensitive' } },
            { entityId: { contains: listParams.q } },
            { actor: { email: { contains: listParams.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(listParams.filters.entity ? { entity: listParams.filters.entity } : {}),
    ...dateRangeArgs(listParams),
  };

  const [total, rows, entities] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginationArgs(listParams),
      include: { actor: { select: { email: true } } },
    }),
    prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
  ]);

  const meta = pageMeta(listParams, total);

  return (
    <AdminPage
      title={isAr ? 'سجل التدقيق' : 'Audit log'}
      description={
        isAr
          ? 'كل إجراء إداري مسجَّل: من فعله، ماذا تغيّر، ومن أي عنوان IP.'
          : 'Every admin action recorded: who did it, what changed, and from which IP.'
      }
    >
      <DataTableToolbar
        exportEntity="audit"
        showDateRange
        searchPlaceholder={isAr ? 'ابحث بالإجراء أو الكيان أو البريد…' : 'Search action, entity or email…'}
        filters={[
          {
            key: 'entity',
            label: isAr ? 'الكيان' : 'Entity',
            options: entities.map((e) => ({ value: e.entity, label: e.entity })),
          },
        ]}
      />

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? 'الوقت' : 'Time'}</TableHead>
              <TableHead>{isAr ? 'المنفّذ' : 'Actor'}</TableHead>
              <TableHead>{isAr ? 'الإجراء' : 'Action'}</TableHead>
              <TableHead>{isAr ? 'الكيان' : 'Entity'}</TableHead>
              <TableHead>{isAr ? 'التفاصيل' : 'Details'}</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={6}>{isAr ? 'لا توجد سجلات' : 'No entries'}</TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.createdAt.toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-US')}
                  </TableCell>
                  <TableCell className="text-sm" dir="ltr">
                    {row.actor?.email ?? (isAr ? 'النظام' : 'system')}
                    {row.impersonatedUserId ? (
                      <Badge variant="warning" className="ms-1 text-[10px]">
                        {isAr ? 'انتحال' : 'impersonating'}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted" className="font-mono text-[11px]">{row.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.entity}
                    {row.entityId ? (
                      <span className="block text-xs text-muted-foreground" dir="ltr">
                        {row.entityId.slice(0, 12)}…
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-64">
                    {row.after ? (
                      <pre className="truncate text-[11px] text-muted-foreground" dir="ltr">
                        {JSON.stringify(row.after)}
                      </pre>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" dir="ltr">
                    {row.ip ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <DataTablePagination meta={meta} />
      </AdminTableCard>
    </AdminPage>
  );
}

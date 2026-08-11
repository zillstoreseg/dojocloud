import { setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, orderByArgs, dateRangeArgs, pageMeta } from '@/lib/admin/query';
import { AdminPage, AdminTableCard } from '@/components/admin/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination, SortableHeader } from '@/components/data-table/pagination';
import { StatCard } from '@/components/admin/stat-card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import { formatMoney, decimalToNumber, toUsd } from '@/lib/money';
import { PaymentRowActions } from './row-actions';

export default async function AdminPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const admin = await requireAdminPage('payments.read', locale);

  const isAr = locale === 'ar';
  const listParams = parseListParams(sp, { defaultSort: 'createdAt' });
  const canReview = admin.permissions === null || admin.permissions.includes('approvals.payments');

  const where: Prisma.PaymentWhereInput = {
    ...(listParams.q
      ? {
          OR: [
            { reference: { contains: listParams.q, mode: 'insensitive' } },
            { subscription: { trainer: { fullName: { contains: listParams.q, mode: 'insensitive' } } } },
            { subscription: { trainer: { username: { contains: listParams.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
    ...(listParams.filters.status ? { status: listParams.filters.status as never } : {}),
    ...(listParams.filters.method ? { method: listParams.filters.method as never } : {}),
    ...dateRangeArgs(listParams),
  };

  const [total, rows, approvedAgg] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: orderByArgs(listParams, ['createdAt', 'amount', 'status']),
      ...paginationArgs(listParams),
      include: {
        subscription: {
          select: {
            plan: { select: { nameAr: true, nameEn: true } },
            trainer: { select: { id: true, fullName: true, username: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({ where: { ...where, status: 'APPROVED' }, select: { amount: true, currency: true } }),
  ]);

  const approvedUsd = approvedAgg.reduce((s, p) => s + toUsd(decimalToNumber(p.amount), p.currency), 0);
  const pendingCount = await prisma.payment.count({ where: { ...where, status: 'PENDING' } });
  const meta = pageMeta(listParams, total);

  return (
    <AdminPage
      title={isAr ? 'المدفوعات' : 'Payments'}
      description={isAr ? 'كل إيصالات الدفع ومراجعتها' : 'All payment receipts and their review state'}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={isAr ? 'إجمالي السجلات' : 'Records'} value={total} />
        <StatCard label={isAr ? 'بانتظار المراجعة' : 'Pending review'} value={pendingCount} invert />
        <StatCard
          label={isAr ? 'المعتمد (دولار)' : 'Approved (USD)'}
          value={`$${approvedUsd.toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-US', { maximumFractionDigits: 0 })}`}
        />
      </div>

      <DataTableToolbar
        exportEntity="payments"
        showDateRange
        searchPlaceholder={isAr ? 'ابحث بالمدرب أو رقم العملية…' : 'Search trainer or reference…'}
        filters={[
          {
            key: 'status',
            label: isAr ? 'الحالة' : 'Status',
            options: [
              { value: 'PENDING', label: isAr ? 'قيد المراجعة' : 'Pending' },
              { value: 'APPROVED', label: isAr ? 'معتمدة' : 'Approved' },
              { value: 'REJECTED', label: isAr ? 'مرفوضة' : 'Rejected' },
              { value: 'REFUNDED', label: isAr ? 'مستردة' : 'Refunded' },
            ],
          },
          {
            key: 'method',
            label: isAr ? 'الطريقة' : 'Method',
            options: [
              { value: 'MANUAL_TRANSFER', label: isAr ? 'تحويل يدوي' : 'Manual transfer' },
              { value: 'INSTAPAY', label: 'InstaPay' },
              { value: 'VODAFONE_CASH', label: isAr ? 'فودافون كاش' : 'Vodafone Cash' },
              { value: 'BANK_TRANSFER', label: isAr ? 'تحويل بنكي' : 'Bank transfer' },
              { value: 'KASHIER', label: 'Kashier' },
              { value: 'ZIINA', label: 'Ziina' },
            ],
          },
        ]}
      />

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortableHeader field="createdAt">{isAr ? 'التاريخ' : 'Date'}</SortableHeader></TableHead>
              <TableHead>{isAr ? 'المدرب' : 'Trainer'}</TableHead>
              <TableHead>{isAr ? 'الخطة' : 'Plan'}</TableHead>
              <TableHead><SortableHeader field="amount">{isAr ? 'المبلغ' : 'Amount'}</SortableHeader></TableHead>
              <TableHead>{isAr ? 'الطريقة' : 'Method'}</TableHead>
              <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>{isAr ? 'لا توجد مدفوعات' : 'No payments'}</TableEmpty>
            ) : (
              rows.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {payment.createdAt.toLocaleDateString(isAr ? 'ar-EG-u-nu-latn' : 'en-US')}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/trainers/${payment.subscription.trainer.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {payment.subscription.trainer.fullName}
                    </Link>
                    <span className="block text-xs text-muted-foreground" dir="ltr">
                      /c/{payment.subscription.trainer.username}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {isAr ? payment.subscription.plan.nameAr : payment.subscription.plan.nameEn}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {formatMoney(decimalToNumber(payment.amount), payment.currency, locale)}
                  </TableCell>
                  <TableCell className="text-xs">{payment.method}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(payment.status)}>{payment.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <PaymentRowActions
                      paymentId={payment.id}
                      status={payment.status}
                      receiptUrl={payment.receiptUrl}
                      canReview={canReview}
                    />
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

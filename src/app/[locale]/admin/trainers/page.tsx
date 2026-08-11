import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { requireAdminPage } from '@/lib/authz';
import { countryLabel } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { parseListParams, paginationArgs, orderByArgs, dateRangeArgs, pageMeta } from '@/lib/admin/query';
import { AdminPage, AdminTableCard } from '@/components/admin/page-shell';
import { DataTableToolbar } from '@/components/data-table/toolbar';
import { DataTablePagination, SortableHeader } from '@/components/data-table/pagination';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from '@/i18n/navigation';
import { initials } from '@/lib/utils';
import { formatNumber } from '@/lib/money';
import { TrainerRowActions } from './row-actions';

const SORTABLE = ['createdAt', 'fullName', 'yearsExperience', 'country'] as const;

export default async function AdminTrainersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const admin = await requireAdminPage('trainers.read', locale);

  const isAr = locale === 'ar';
  const tSpecialty = await getTranslations('specialties');
  const listParams = parseListParams(sp, { defaultSort: 'createdAt' });

  const where: Prisma.TrainerProfileWhereInput = {
    ...(listParams.q
      ? {
          OR: [
            { fullName: { contains: listParams.q, mode: 'insensitive' } },
            { username: { contains: listParams.q, mode: 'insensitive' } },
            { phone: { contains: listParams.q } },
            { user: { email: { contains: listParams.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(listParams.filters.status ? { approvalStatus: listParams.filters.status as never } : {}),
    ...(listParams.filters.country ? { country: listParams.filters.country } : {}),
    ...dateRangeArgs(listParams),
  };

  const [total, rows, countries] = await Promise.all([
    prisma.trainerProfile.count({ where }),
    prisma.trainerProfile.findMany({
      where,
      orderBy: orderByArgs(listParams, SORTABLE),
      ...paginationArgs(listParams),
      include: {
        user: { select: { id: true, email: true, status: true, lastLoginAt: true } },
        _count: { select: { trainees: true, certificates: true } },
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          take: 1,
          select: { status: true, endsAt: true, plan: { select: { nameAr: true, nameEn: true } } },
        },
      },
    }),
    prisma.trainerProfile.findMany({ distinct: ['country'], select: { country: true }, orderBy: { country: 'asc' } }),
  ]);

  const meta = pageMeta(listParams, total);

  return (
    <AdminPage
      title={isAr ? 'المدربون' : 'Trainers'}
      description={isAr ? `${formatNumber(total, locale)} مدرب` : `${formatNumber(total, locale)} trainers`}
    >
      <DataTableToolbar
        exportEntity="trainers"
        showDateRange
        searchPlaceholder={isAr ? 'ابحث بالاسم أو البريد أو الهاتف…' : 'Search name, email or phone…'}
        filters={[
          {
            key: 'status',
            label: isAr ? 'الحالة' : 'Status',
            options: [
              { value: 'PENDING', label: isAr ? 'قيد المراجعة' : 'Pending' },
              { value: 'APPROVED', label: isAr ? 'معتمد' : 'Approved' },
              { value: 'REJECTED', label: isAr ? 'مرفوض' : 'Rejected' },
            ],
          },
          {
            key: 'country',
            label: isAr ? 'الدولة' : 'Country',
            options: countries
              .filter((c) => c.country)
              .map((c) => ({ value: c.country, label: countryLabel(c.country, locale) })),
          },
        ]}
      />

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortableHeader field="fullName">{isAr ? 'المدرب' : 'Trainer'}</SortableHeader></TableHead>
              <TableHead>{isAr ? 'التخصص' : 'Specialty'}</TableHead>
              <TableHead><SortableHeader field="country">{isAr ? 'الدولة' : 'Country'}</SortableHeader></TableHead>
              <TableHead>{isAr ? 'الخطة' : 'Plan'}</TableHead>
              <TableHead>{isAr ? 'متدربون' : 'Trainees'}</TableHead>
              <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
              <TableHead><SortableHeader field="createdAt">{isAr ? 'التسجيل' : 'Joined'}</SortableHeader></TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>{isAr ? 'لا توجد نتائج' : 'No results'}</TableEmpty>
            ) : (
              rows.map((trainer) => {
                const sub = trainer.subscriptions[0];
                return (
                  <TableRow key={trainer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {trainer.avatarUrl ? <AvatarImage src={trainer.avatarUrl} alt="" /> : null}
                          <AvatarFallback className="text-xs">{initials(trainer.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/trainers/${trainer.id}`}
                            className="block truncate font-medium hover:text-primary hover:underline"
                          >
                            {trainer.fullName}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                            {trainer.user.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-40 flex-wrap gap-1">
                        {trainer.specialties.slice(0, 2).map((s) => (
                          <Badge key={s} variant="secondary" className="text-[11px]">
                            {tSpecialty(s)}
                          </Badge>
                        ))}
                        {trainer.specialties.length > 2 ? (
                          <Badge variant="muted" className="text-[11px]">+{trainer.specialties.length - 2}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{countryLabel(trainer.country, locale)}</TableCell>
                    <TableCell className="text-sm">
                      {sub ? (
                        <div>
                          <p>{isAr ? sub.plan.nameAr : sub.plan.nameEn}</p>
                          {sub.endsAt ? (
                            <p className="text-xs text-muted-foreground">
                              {isAr ? 'حتى' : 'until'}{' '}
                              {sub.endsAt.toLocaleDateString(isAr ? 'ar-EG-u-nu-latn' : 'en-US')}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{trainer._count.trainees}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(trainer.approvalStatus)}>
                        {trainer.approvalStatus === 'APPROVED'
                          ? isAr ? 'معتمد' : 'Approved'
                          : trainer.approvalStatus === 'PENDING'
                            ? isAr ? 'قيد المراجعة' : 'Pending'
                            : isAr ? 'مرفوض' : 'Rejected'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {trainer.createdAt.toLocaleDateString(isAr ? 'ar-EG-u-nu-latn' : 'en-US')}
                    </TableCell>
                    <TableCell>
                      <TrainerRowActions
                        trainerId={trainer.id}
                        userId={trainer.user.id}
                        username={trainer.username}
                        userStatus={trainer.user.status}
                        canImpersonate={admin.permissions === null || admin.permissions.includes('users.impersonate')}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <DataTablePagination meta={meta} />
      </AdminTableCard>
    </AdminPage>
  );
}

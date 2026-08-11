import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission, type Permission } from '@/lib/permissions';
import { parseListParams, orderByArgs, dateRangeArgs, toCsv } from '@/lib/admin/query';
import { audit } from '@/lib/audit';
import { decimalToNumber } from '@/lib/money';

/**
 * CSV export for every admin list. Exports honour the same filters as the
 * on-screen table, so what the admin sees is what they get.
 *
 * Row cap: exports are bounded to keep a single request from streaming the
 * whole database into memory.
 */
const MAX_ROWS = 10_000;

type Exporter = {
  permission: Permission;
  run: (params: ReturnType<typeof parseListParams>) => Promise<Array<Record<string, unknown>>>;
};

const EXPORTERS: Record<string, Exporter> = {
  trainers: {
    permission: 'trainers.read',
    run: async (p) => {
      const rows = await prisma.trainerProfile.findMany({
        where: {
          ...(p.q
            ? {
                OR: [
                  { fullName: { contains: p.q, mode: 'insensitive' } },
                  { username: { contains: p.q, mode: 'insensitive' } },
                  { user: { email: { contains: p.q, mode: 'insensitive' } } },
                ],
              }
            : {}),
          ...(p.filters.status ? { approvalStatus: p.filters.status as never } : {}),
          ...(p.filters.country ? { country: p.filters.country } : {}),
          ...dateRangeArgs(p),
        },
        orderBy: orderByArgs(p, ['createdAt', 'fullName', 'country']),
        take: MAX_ROWS,
        include: { user: { select: { email: true } }, _count: { select: { trainees: true } } },
      });
      return rows.map((t) => ({
        name: t.fullName,
        username: t.username,
        email: t.user.email,
        phone: t.phone,
        country: t.country,
        city: t.city ?? '',
        gender: t.gender,
        trains: t.trainsGenders,
        yearsExperience: t.yearsExperience,
        specialties: t.specialties.join('|'),
        status: t.approvalStatus,
        trainees: t._count.trainees,
        joinedAt: t.createdAt.toISOString().slice(0, 10),
      }));
    },
  },

  trainees: {
    permission: 'trainees.read',
    run: async (p) => {
      const rows = await prisma.trainee.findMany({
        where: {
          ...(p.q ? { OR: [{ fullName: { contains: p.q, mode: 'insensitive' } }, { phone: { contains: p.q } }] } : {}),
          ...(p.filters.status ? { status: p.filters.status as never } : {}),
          ...dateRangeArgs(p),
        },
        orderBy: orderByArgs(p, ['createdAt', 'fullName']),
        take: MAX_ROWS,
        include: { trainer: { select: { fullName: true, username: true } } },
      });
      return rows.map((t) => ({
        name: t.fullName,
        phone: t.phone ?? '',
        email: t.email ?? '',
        trainer: t.trainer.fullName,
        trainerUsername: t.trainer.username,
        gender: t.gender ?? '',
        goal: t.goal ?? '',
        status: t.status,
        startDate: t.startDate.toISOString().slice(0, 10),
        renewalDate: t.renewalDate?.toISOString().slice(0, 10) ?? '',
      }));
    },
  },

  payments: {
    permission: 'payments.read',
    run: async (p) => {
      const rows = await prisma.payment.findMany({
        where: {
          ...(p.filters.status ? { status: p.filters.status as never } : {}),
          ...(p.filters.method ? { method: p.filters.method as never } : {}),
          ...dateRangeArgs(p),
        },
        orderBy: orderByArgs(p, ['createdAt', 'amount']),
        take: MAX_ROWS,
        include: {
          subscription: {
            select: {
              plan: { select: { nameEn: true } },
              trainer: { select: { fullName: true, username: true, country: true } },
            },
          },
        },
      });
      return rows.map((row) => ({
        date: row.createdAt.toISOString().slice(0, 10),
        trainer: row.subscription.trainer.fullName,
        username: row.subscription.trainer.username,
        country: row.subscription.trainer.country,
        plan: row.subscription.plan.nameEn,
        amount: decimalToNumber(row.amount),
        currency: row.currency,
        method: row.method,
        status: row.status,
        reference: row.reference ?? '',
        reviewedAt: row.reviewedAt?.toISOString().slice(0, 10) ?? '',
      }));
    },
  },

  subscriptions: {
    permission: 'subscriptions.read',
    run: async (p) => {
      const rows = await prisma.subscription.findMany({
        where: {
          ...(p.filters.status ? { status: p.filters.status as never } : {}),
          ...dateRangeArgs(p),
        },
        orderBy: orderByArgs(p, ['createdAt', 'endsAt']),
        take: MAX_ROWS,
        include: {
          plan: { select: { nameEn: true, interval: true } },
          trainer: { select: { fullName: true, username: true } },
        },
      });
      return rows.map((s) => ({
        trainer: s.trainer.fullName,
        username: s.trainer.username,
        plan: s.plan.nameEn,
        interval: s.plan.interval,
        status: s.status,
        amount: decimalToNumber(s.amount),
        currency: s.currency,
        startsAt: s.startsAt?.toISOString().slice(0, 10) ?? '',
        endsAt: s.endsAt?.toISOString().slice(0, 10) ?? '',
        createdAt: s.createdAt.toISOString().slice(0, 10),
      }));
    },
  },

  leads: {
    permission: 'leads.read',
    run: async (p) => {
      const rows = await prisma.lead.findMany({
        where: {
          ...(p.filters.status ? { status: p.filters.status as never } : {}),
          ...dateRangeArgs(p),
        },
        orderBy: orderByArgs(p, ['createdAt']),
        take: MAX_ROWS,
        include: { trainer: { select: { fullName: true, username: true } } },
      });
      return rows.map((l) => ({
        date: l.createdAt.toISOString().slice(0, 10),
        name: l.name,
        phone: l.phone,
        email: l.email ?? '',
        goal: l.goal ?? '',
        trainer: l.trainer.fullName,
        trainerUsername: l.trainer.username,
        source: l.source ?? '',
        utmSource: l.utmSource ?? '',
        utmCampaign: l.utmCampaign ?? '',
        status: l.status,
      }));
    },
  },

  'ai-usage': {
    permission: 'analytics.ai',
    run: async (p) => {
      const rows = await prisma.aiUsage.findMany({
        where: dateRangeArgs(p),
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });
      return rows.map((u) => ({
        date: u.createdAt.toISOString(),
        feature: u.feature,
        model: u.model,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        costUsd: decimalToNumber(u.costUsd),
        success: u.success,
      }));
    },
  },

  audit: {
    permission: 'audit.read',
    run: async (p) => {
      const rows = await prisma.auditLog.findMany({
        where: {
          ...(p.filters.entity ? { entity: p.filters.entity } : {}),
          ...dateRangeArgs(p),
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        include: { actor: { select: { email: true } } },
      });
      return rows.map((a) => ({
        date: a.createdAt.toISOString(),
        actor: a.actor?.email ?? 'system',
        action: a.action,
        entity: a.entity,
        entityId: a.entityId ?? '',
        ip: a.ip ?? '',
      }));
    },
  },
};

export async function GET(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const exporter = EXPORTERS[entity];
  if (!exporter) return new Response('Unknown export', { status: 404 });

  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return new Response('Forbidden', { status: 403 });
  }
  if (!hasPermission(session.user, exporter.permission)) {
    return new Response('Forbidden', { status: 403 });
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const params = parseListParams(searchParams);
  const rows = await exporter.run(params);

  // Exports can contain personal data, so the act of exporting is itself audited.
  await audit({
    actorId: session.user.id,
    action: 'data.export',
    entity: entity,
    after: { rows: rows.length, filters: params.filters, q: params.q },
  });

  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

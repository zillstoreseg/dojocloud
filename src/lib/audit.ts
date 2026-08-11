import { headers } from 'next/headers';
import { prisma } from './prisma';
import type { NotificationType } from '@prisma/client';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  impersonatedUserId?: string | null;
}

/**
 * Writes an audit entry. Never throws — an audit failure must not roll back the
 * business action that triggered it.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
      userAgent = h.get('user-agent');
    } catch {
      // Called outside a request scope (e.g. cron) — headers are unavailable.
    }

    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        impersonatedUserId: input.impersonatedUserId ?? null,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error('[audit] failed to write entry', error);
  }
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  titleAr: string;
  titleEn: string;
  bodyAr?: string;
  bodyEn?: string;
  link?: string;
  payload?: Record<string, unknown>;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        titleAr: input.titleAr,
        titleEn: input.titleEn,
        bodyAr: input.bodyAr,
        bodyEn: input.bodyEn,
        link: input.link,
        payload: (input.payload ?? undefined) as never,
      },
    });
  } catch (error) {
    console.error('[notify] failed to create notification', error);
  }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  await Promise.all(inputs.map(notify));
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

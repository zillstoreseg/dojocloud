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
  /**
   * Set false to keep a notification in-app only, regardless of the admin's
   * email settings. For the high-frequency ones — a new scan, a logged set —
   * where an inbox entry would be noise rather than news.
   */
  email?: boolean;
}

/**
 * Writes an in-app notification, and emails it when the admin has said that
 * this kind of notification is worth an email.
 *
 * The in-app row is written first and independently: if mail is misconfigured
 * the user still sees the notification when they next open the app, which is
 * the guarantee that matters. Mail is the escalation, not the record.
 *
 * Which types escalate is a setting rather than a hard-coded list, because the
 * right answer differs per platform — some owners want every lead emailed,
 * others would consider that spam.
 */
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

  if (input.email === false) return;

  try {
    const { getSetting } = await import('./settings');
    const enabled = (await getSetting('email.notify_types'))
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!enabled.includes(input.type)) return;

    const { emailUser } = await import('./email');
    await emailUser({
      userId: input.userId,
      template: `notify.${input.type.toLowerCase()}`,
      subject: { ar: input.titleAr, en: input.titleEn },
      content: {
        ar: {
          preheader: input.bodyAr ?? input.titleAr,
          heading: input.titleAr,
          body: input.bodyAr ? [input.bodyAr] : [],
          cta: input.link ? { label: 'افتح من هنا', href: input.link } : undefined,
        },
        en: {
          preheader: input.bodyEn ?? input.titleEn,
          heading: input.titleEn,
          body: input.bodyEn ? [input.bodyEn] : [],
          cta: input.link ? { label: 'Open it', href: input.link } : undefined,
        },
      },
    });
  } catch (error) {
    console.error('[notify] failed to send email', error);
  }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  await Promise.all(inputs.map(notify));
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

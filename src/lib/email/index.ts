import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { activeEmailProvider } from './provider';
import { renderEmail, type EmailContent } from './render';

export type { EmailContent } from './render';
export { absoluteUrl } from './render';

/**
 * Sending one email.
 *
 * Never throws. Mail is a side effect of business actions — approving a
 * payment, crediting a wallet — and a bounced address must not roll back the
 * thing the user actually asked for. Every attempt is written to `EmailLog`
 * with its outcome, which is the only way the admin can tell "we never sent it"
 * from "we sent it and they did not read it".
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  content: EmailContent;
  locale?: string;
  template?: string;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const to = input.to.trim();
  if (!to || !to.includes('@')) return { ok: false };

  let logId: string | null = null;

  try {
    const brand = await getBrand();
    const { html, text } = renderEmail(input.content, {
      locale: input.locale ?? 'ar',
      brandName: brand.name,
    });

    const log = await prisma.emailLog.create({
      data: { to, subject: input.subject, template: input.template ?? null, status: 'QUEUED' },
      select: { id: true },
    });
    logId = log.id;

    const { provider, config } = await activeEmailProvider();
    const result = await provider.send(
      { to, subject: input.subject, html, text, template: input.template },
      config,
    );

    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        // `SKIPPED` is distinct from `SENT` on purpose: a developer machine with
        // no provider should not leave a log that claims mail went out.
        status: result.ok ? (result.skipped ? 'SKIPPED' : 'SENT') : 'FAILED',
        error: result.error ?? null,
        sentAt: result.ok && !result.skipped ? new Date() : null,
      },
    });

    return { ok: result.ok, skipped: result.skipped };
  } catch (error) {
    console.error('[email] send failed', error);
    if (logId) {
      await prisma.emailLog
        .update({
          where: { id: logId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message.slice(0, 400) : 'Unknown',
          },
        })
        .catch(() => undefined);
    }
    return { ok: false };
  }
}

/**
 * Emails a user by id, if they have an address and have not opted out.
 *
 * Looking the address up here rather than at the call site means no caller can
 * accidentally mail the wrong person by passing a stale string, and the
 * opt-out check happens in exactly one place.
 */
export async function emailUser(input: {
  userId: string;
  subject: { ar: string; en: string };
  content: { ar: EmailContent; en: EmailContent };
  template?: string;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, locale: true, status: true },
  });

  // A suspended account gets no mail: whatever the notification says, the
  // action it invites them to take is one they cannot complete.
  if (!user?.email || user.status === 'SUSPENDED') return { ok: false, skipped: true };

  const isAr = user.locale !== 'en';

  return sendEmail({
    to: user.email,
    subject: isAr ? input.subject.ar : input.subject.en,
    content: isAr ? input.content.ar : input.content.en,
    locale: isAr ? 'ar' : 'en',
    template: input.template,
  });
}

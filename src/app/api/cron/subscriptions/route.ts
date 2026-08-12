import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/audit';
import { env } from '@/lib/env';
import { daysRemaining } from '@/lib/billing';

/**
 * Daily subscription maintenance: expire what has run out, and warn the people
 * whose access is about to pause.
 *
 * Runs on a schedule (Vercel Cron, a system timer, whatever the deploy uses)
 * and is safe to run more than once a day — each reminder is written at most
 * once per subscription per threshold.
 */

/** Days before expiry that earn a reminder, largest first. */
const REMINDER_DAYS = [7, 3, 1] as const;

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request) {
  // A cron endpoint that anybody can trigger is a denial-of-service waiting to
  // happen, so the secret is required rather than optional-in-practice.
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== env.CRON_SECRET) return unauthorized();

  const now = new Date();

  // ── 1. Expire anything past its end date ────────────────────────────────
  const expiring = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIALING'] }, endsAt: { lt: now } },
    select: { id: true, trainer: { select: { userId: true } } },
  });

  if (expiring.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: expiring.map((s) => s.id) } },
      data: { status: 'EXPIRED' },
    });
    await Promise.all(
      expiring.map((subscription) =>
        notify({
          userId: subscription.trainer.userId,
          type: 'SUBSCRIPTION_EXPIRED',
          titleAr: 'انتهى اشتراكك',
          titleEn: 'Your subscription has expired',
          bodyAr: 'جدّد اشتراكك عشان ترجع تستخدم لوحة التحكم.',
          bodyEn: 'Renew to get your dashboard back.',
          link: '/dash/billing',
          payload: { kind: 'subscription-expired', subscriptionId: subscription.id },
        }),
      ),
    );
  }

  // ── 2. Remind the ones about to expire ──────────────────────────────────
  const horizon = new Date(now.getTime() + (REMINDER_DAYS[0] + 1) * 864e5);
  const soon = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'TRIALING'] },
      endsAt: { gte: now, lte: horizon },
    },
    select: { id: true, endsAt: true, status: true, trainer: { select: { userId: true } } },
  });

  let reminders = 0;
  for (const subscription of soon) {
    const left = daysRemaining(subscription.endsAt, now);
    // Snap to the largest threshold that has been reached, so a subscription
    // six days out gets the "3 days" reminder later rather than nothing now.
    const threshold = REMINDER_DAYS.find((day) => left === day);
    if (!threshold) continue;

    // Idempotency: one reminder per subscription per threshold, forever.
    const already = await prisma.notification.findFirst({
      where: {
        userId: subscription.trainer.userId,
        type: 'SUBSCRIPTION_EXPIRING',
        payload: { equals: { kind: 'renewal-reminder', subscriptionId: subscription.id, daysOut: threshold } },
      },
      select: { id: true },
    });
    if (already) continue;

    const trialing = subscription.status === 'TRIALING';
    await notify({
      userId: subscription.trainer.userId,
      type: 'SUBSCRIPTION_EXPIRING',
      titleAr: trialing ? 'تجربتك على وشك الانتهاء' : 'اشتراكك على وشك الانتهاء',
      titleEn: trialing ? 'Your trial is ending soon' : 'Your subscription is ending soon',
      bodyAr: `باقي ${threshold} ${threshold === 1 ? 'يوم' : 'أيام'}. جدّد قبل ما الحساب يقف.`,
      bodyEn: `${threshold} day${threshold === 1 ? '' : 's'} left. Renew before access pauses.`,
      link: '/dash/billing',
      payload: { kind: 'renewal-reminder', subscriptionId: subscription.id, daysOut: threshold },
    });
    reminders += 1;
  }

  return NextResponse.json({ ok: true, expired: expiring.length, reminders });
}

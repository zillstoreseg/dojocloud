import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/audit';
import { env } from '@/lib/env';
import { daysRemaining } from '@/lib/billing';
import { releaseMatured } from '@/lib/wallet';
import { pruneRateLimits } from '@/lib/rate-limit';
import { pruneResetTokens } from '@/lib/password-reset';

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

  // ── 3. Trainees whose subscription with their coach is running out ──────
  //
  // This is the coach's revenue, not the platform's, so the reminder goes to
  // both: the trainee, who has to pay, and the coach, whose income depends on
  // asking. A coach who learns about a lapse a week late has usually lost the
  // trainee.
  const traineeHorizon = new Date(now.getTime() + (REMINDER_DAYS[0] + 1) * 864e5);
  const renewing = await prisma.trainee.findMany({
    where: {
      status: 'ACTIVE',
      renewalDate: { gte: now, lte: traineeHorizon },
    },
    select: {
      id: true,
      fullName: true,
      renewalDate: true,
      userId: true,
      trainer: { select: { userId: true } },
    },
  });

  let traineeReminders = 0;
  for (const trainee of renewing) {
    const left = daysRemaining(trainee.renewalDate, now);
    const threshold = REMINDER_DAYS.find((day) => left === day);
    if (!threshold) continue;

    const payload = { kind: 'trainee-renewal', traineeId: trainee.id, daysOut: threshold };

    const already = await prisma.notification.findFirst({
      where: {
        userId: trainee.trainer.userId,
        type: 'TRAINEE_RENEWAL_DUE',
        payload: { equals: payload },
      },
      select: { id: true },
    });
    if (already) continue;

    await notify({
      userId: trainee.trainer.userId,
      type: 'TRAINEE_RENEWAL_DUE',
      titleAr: `اشتراك ${trainee.fullName} على وشك الانتهاء`,
      titleEn: `${trainee.fullName}'s subscription is ending`,
      bodyAr: `باقي ${threshold} ${threshold === 1 ? 'يوم' : 'أيام'}. كلّمه قبل ما يقف.`,
      bodyEn: `${threshold} day${threshold === 1 ? '' : 's'} left. Reach out before it lapses.`,
      link: '/dash/trainees',
      payload,
    });
    traineeReminders += 1;

    // Only trainees who chose a login have somewhere to receive this.
    if (trainee.userId) {
      await notify({
        userId: trainee.userId,
        type: 'TRAINEE_RENEWAL_DUE',
        titleAr: 'اشتراكك على وشك الانتهاء',
        titleEn: 'Your subscription is ending soon',
        bodyAr: `باقي ${threshold} ${threshold === 1 ? 'يوم' : 'أيام'}. جدّد مع مدربك عشان تكمّل برنامجك.`,
        bodyEn: `${threshold} day${threshold === 1 ? '' : 's'} left. Renew with your coach to keep going.`,
        link: '/my/subscription',
        payload,
      });
    }
  }

  // ── 4. Release wallet holds that have matured ───────────────────────────
  // Coaches also get a lazy release when they open their wallet, so a missed
  // run delays the ledger entry rather than the coach's money.
  const released = await releaseMatured().catch(() => 0);

  // ── 5. Housekeeping ─────────────────────────────────────────────────────
  // Rate-limit hits and spent reset tokens are write-heavy and read-recent;
  // without a sweep they grow forever for no benefit.
  const [prunedLimits, prunedTokens] = await Promise.all([
    pruneRateLimits().catch(() => 0),
    pruneResetTokens().catch(() => 0),
  ]);

  return NextResponse.json({
    prunedLimits,
    prunedTokens,
    ok: true,
    expired: expiring.length,
    reminders,
    traineeReminders,
    released,
  });
}

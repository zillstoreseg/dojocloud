import { headers } from 'next/headers';
import { prisma } from './prisma';

/**
 * Rate limiting that survives a deploy and works behind more than one instance.
 *
 * The obvious implementation — a `Map` in module scope — is per-process. It
 * resets every time the app restarts, and behind two instances a limit of five
 * becomes ten. For a contact form that is merely sloppy; for a login endpoint
 * it means the throttle does not exist.
 *
 * So hits are rows, and the limit is a count over a time window. Counting rows
 * rather than keeping a counter also removes the read-modify-write: two
 * simultaneous requests cannot both read "4" and both conclude they are under
 * a limit of 5.
 */

export const LIMITS = {
  /** Failed sign-ins, per email+IP. Deliberately tight. */
  login: { max: 8, windowMs: 15 * 60 * 1000 },
  /** Password reset requests, per email. */
  passwordReset: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Password reset requests from one address, whatever email they ask for. */
  passwordResetIp: { max: 15, windowMs: 60 * 60 * 1000 },
  /** Public contact-form submissions on a coach's landing page. */
  lead: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Receipt uploads from a signed-out visitor finishing a subscription. */
  receipt: { max: 6, windowMs: 60 * 60 * 1000 },
  /** Messages sent, per user. Generous — this is anti-flood, not anti-chat. */
  message: { max: 60, windowMs: 5 * 60 * 1000 },
} as const;

export type LimitBucket = keyof typeof LIMITS;

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  /** When the oldest hit in the window falls out, so the caller can say when. */
  retryAt: Date | null;
}

/** The caller's IP, or a stable placeholder outside a request scope. */
export async function requestIp(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
    );
  } catch {
    return 'unknown';
  }
}

/**
 * Records an attempt and reports whether it is allowed.
 *
 * The hit is written first, then counted. Recording before deciding means a
 * request that races past the check still leaves a trace, so a burst that
 * briefly exceeds the limit is at least visible rather than invisible.
 *
 * Never throws: a limiter that takes the site down when the database hiccups
 * is worse than the abuse it prevents.
 */
export async function rateLimit(
  bucket: LimitBucket,
  subject: string,
  options?: { record?: boolean },
): Promise<LimitResult> {
  const limit = LIMITS[bucket];
  const since = new Date(Date.now() - limit.windowMs);
  const key = subject.slice(0, 200).toLowerCase();

  try {
    if (options?.record !== false) {
      await prisma.rateLimitHit.create({ data: { bucket, subject: key } });
    }

    const hits = await prisma.rateLimitHit.findMany({
      where: { bucket, subject: key, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
      take: limit.max + 1,
    });

    const allowed = hits.length <= limit.max;
    const oldest = hits[0]?.createdAt ?? null;

    return {
      allowed,
      remaining: Math.max(0, limit.max - hits.length),
      retryAt: allowed || !oldest ? null : new Date(oldest.getTime() + limit.windowMs),
    };
  } catch (error) {
    console.error('[rate-limit] check failed, allowing the request', error);
    return { allowed: true, remaining: limit.max, retryAt: null };
  }
}

/**
 * Clears a subject's hits.
 *
 * Called after a successful sign-in: the throttle exists to slow down someone
 * guessing, and a person who has just proved they know the password is not
 * that. Without this, a user who fumbles their password a few times then gets
 * it right would stay throttled for the rest of the window.
 */
export async function clearRateLimit(bucket: LimitBucket, subject: string): Promise<void> {
  await prisma.rateLimitHit
    .deleteMany({ where: { bucket, subject: subject.slice(0, 200).toLowerCase() } })
    .catch(() => undefined);
}

/** Drops hits older than any window. Called from the daily cron. */
export async function pruneRateLimits(): Promise<number> {
  const oldest = Math.max(...Object.values(LIMITS).map((l) => l.windowMs));
  const result = await prisma.rateLimitHit.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - oldest * 2) } },
  });
  return result.count;
}

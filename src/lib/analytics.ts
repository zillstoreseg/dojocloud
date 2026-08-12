import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { prisma } from './prisma';

/**
 * First-party visitor tracking.
 *
 * No third-party script and no cross-site cookie: a view is a row in our own
 * database. The visitor is identified by a salted daily hash of IP + user
 * agent, which is enough to count sessions but cannot be reversed into an
 * address and rotates every day on its own. Do-Not-Track is honoured, and
 * obvious bots are recorded as such rather than dropped, so the admin can see
 * how much of the traffic is crawlers.
 */

const BOT_PATTERN =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|headlesschrome|lighthouse|curl|wget|python-requests|axios|monitoring/i;

function sessionIdFrom(ip: string, userAgent: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${process.env.AUTH_SECRET ?? 'coachmate'}|${day}|${ip}|${userAgent}`)
    .digest('hex')
    .slice(0, 32);
}

function deviceFrom(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function browserFrom(ua: string): string {
  // Order matters: Edge and Opera both claim to be Chrome, Chrome claims Safari.
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/firefox\//i.test(ua)) return 'Firefox';
  if (/chrome\//i.test(ua)) return 'Chrome';
  if (/safari\//i.test(ua)) return 'Safari';
  return 'Other';
}

export interface TrackInput {
  path: string;
  trainerId?: string | null;
  pageId?: string | null;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
}

/**
 * Records a page view. Never throws — analytics must not be able to break the
 * page it is measuring — and never blocks the response on a slow write.
 */
export async function trackPageView(input: TrackInput): Promise<void> {
  try {
    const h = await headers();
    if (h.get('dnt') === '1' || h.get('sec-gpc') === '1') return;

    const ua = h.get('user-agent') ?? '';
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? '0.0.0.0';

    await prisma.pageView.create({
      data: {
        path: input.path.slice(0, 500),
        trainerId: input.trainerId ?? null,
        pageId: input.pageId ?? null,
        sessionId: sessionIdFrom(ip, ua),
        referrer: h.get('referer')?.slice(0, 500) ?? null,
        utmSource: input.utm?.source?.slice(0, 120) ?? null,
        utmMedium: input.utm?.medium?.slice(0, 120) ?? null,
        utmCampaign: input.utm?.campaign?.slice(0, 120) ?? null,
        // Vercel and Cloudflare both surface the country; locally it is absent.
        country: (h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry'))?.slice(0, 4) ?? null,
        device: deviceFrom(ua),
        browser: browserFrom(ua),
        isBot: BOT_PATTERN.test(ua) || ua === '',
      },
    });
  } catch {
    // Deliberately silent.
  }
}

/** Reads the UTM triplet out of a search-params object. */
export function utmFrom(
  sp: Record<string, string | string[] | undefined> | undefined,
): TrackInput['utm'] {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return {
    source: one(sp?.utm_source),
    medium: one(sp?.utm_medium),
    campaign: one(sp?.utm_campaign),
  };
}

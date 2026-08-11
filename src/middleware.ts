import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Route prefixes (after the locale segment) that require a signed-in user.
 * The definitive role check happens server-side in `authz.ts`; this middleware
 * only avoids rendering a protected shell for anonymous visitors.
 */
const PROTECTED_PREFIXES = ['/admin', '/dash', '/my', '/onboarding'];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Anonymous visitor tracking uses a first-party, rotating session id.
  const response = intlMiddleware(request);

  if (!request.cookies.get('cm_sid')) {
    response.cookies.set('cm_sid', crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 30, // rotates every 30 minutes — a session, not an identity
      path: '/',
    });
  }

  const segments = pathname.split('/').filter(Boolean);
  const locale = routing.locales.includes(segments[0] as never) ? segments[0] : routing.defaultLocale;
  const rest = `/${segments.slice(routing.locales.includes(segments[0] as never) ? 1 : 0).join('/')}`;

  if (PROTECTED_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`))) {
    const hasSession =
      request.cookies.has('authjs.session-token') ||
      request.cookies.has('__Secure-authjs.session-token');
    if (!hasSession) {
      const url = new URL(`/${locale}/login`, request.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|uploads|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};

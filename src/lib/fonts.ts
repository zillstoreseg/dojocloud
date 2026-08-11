import { Readex_Pro, IBM_Plex_Sans_Arabic } from 'next/font/google';

/**
 * Typography pairing for the whole product.
 *
 * `next/font` downloads and serves these from our own origin at build time —
 * no runtime CDN request, no FOUT, and no layout shift from a late swap.
 *
 * Readex Pro draws Arabic and Latin from one design, so a heading keeps the
 * same voice in `/ar` and `/en`. It is also far less worn than Cairo/Tajawal,
 * which is most of what makes the brand look like itself rather than like
 * every other Arabic dashboard.
 */
export const display = Readex_Pro({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

/**
 * Body face. Plex Arabic holds up at 13–14px inside dense admin tables, which
 * Readex — optically larger — does not.
 */
export const body = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

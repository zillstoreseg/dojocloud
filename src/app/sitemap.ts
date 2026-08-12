import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { publicEnv } from '@/lib/env';
import { routing } from '@/i18n/routing';

/**
 * The sitemap is the directory's other half: the filters make a coach findable
 * once someone is on the site, and this is what gets them indexed in the first
 * place. Every approved coach's profile is listed in both languages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.appUrl.replace(/\/$/, '');
  const locales = routing.locales;

  const staticPaths = ['', '/coaches', '/pricing', '/register', '/login'];

  const entries: MetadataRoute.Sitemap = staticPaths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: path === '/coaches' ? ('daily' as const) : ('weekly' as const),
      priority: path === '' ? 1 : path === '/coaches' ? 0.9 : 0.5,
    })),
  );

  const coaches = await prisma.trainerProfile
    .findMany({
      where: {
        approvalStatus: 'APPROVED',
        isListed: true,
        // Only pages that actually exist publicly; an unpublished one would be
        // a soft 404 for anything that followed the link.
        landingPages: { some: { status: 'PUBLISHED' } },
      },
      select: { username: true, updatedAt: true },
      take: 10000,
    })
    .catch(() => []);

  for (const coach of coaches) {
    for (const locale of locales) {
      entries.push({
        url: `${base}/${locale}/c/${coach.username}`,
        lastModified: coach.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  }

  return entries;
}

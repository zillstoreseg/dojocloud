import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.appUrl.replace(/\/$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in surfaces and the checkout flow have nothing to index and
      // plenty to leak.
      disallow: ['/api/', '/ar/dash/', '/en/dash/', '/ar/admin/', '/en/admin/', '/ar/my/', '/en/my/', '/ar/join/', '/en/join/', '/ar/onboarding/', '/en/onboarding/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

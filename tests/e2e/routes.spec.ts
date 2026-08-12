import { test, expect } from '@playwright/test';
import { ACCOUNTS, COACH_USERNAME, signIn, collectErrors, revealAll } from './helpers';

/**
 * A sweep of every surface, in both locales.
 *
 * Deliberately shallow and deliberately wide. Most of the regressions this
 * project actually hit were whole-page failures that no unit test could catch —
 * a zod object exported from a `'use server'` file, a locale-less router drop,
 * a font that could not shape Arabic — and every one of them showed up the
 * moment a real browser opened the route. Depth belongs in the journey specs;
 * this file exists to notice a 500.
 */

const PUBLIC_ROUTES = ['/', '/coaches', `/c/${COACH_USERNAME}`, '/login', '/register'];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/activations',
  '/admin/analytics/revenue',
  '/admin/analytics/profit',
  '/admin/analytics/subscriptions',
  '/admin/analytics/traffic',
  '/admin/analytics/ai',
  '/admin/trainers',
  '/admin/trainees',
  '/admin/plans',
  '/admin/payments',
  '/admin/payouts',
  '/admin/library/exercises',
  '/admin/library/foods',
  '/admin/food-scans',
  '/admin/pages',
  '/admin/flags',
  '/admin/design',
  '/admin/settings',
  '/admin/system',
  '/admin/audit',
];

const COACH_ROUTES = [
  '/dash',
  '/dash/trainees',
  '/dash/exercises',
  '/dash/programs',
  '/dash/nutrition',
  '/dash/ai',
  '/dash/page',
  '/dash/leads',
  '/dash/packages',
  '/dash/wallet',
  '/dash/billing',
];

for (const locale of ['ar', 'en'] as const) {
  test.describe(`public routes (${locale})`, () => {
    for (const route of PUBLIC_ROUTES) {
      test(`${locale}${route} renders`, async ({ page }) => {
        const console = collectErrors(page);
        const response = await page.goto(`/${locale}${route}`, { waitUntil: 'networkidle' });

        expect(response?.status(), `${route} returned ${response?.status()}`).toBeLessThan(400);
        await revealAll(page);
        console.assertClean();
      });
    }

    test(`${locale} document direction matches the locale`, async ({ page }) => {
      await page.goto(`/${locale}`, { waitUntil: 'domcontentloaded' });
      const dir = await page.evaluate(() => document.documentElement.dir);
      expect(dir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
    });
  });
}

test.describe('admin panel', () => {
  // One test per route rather than one loop over all of them. In dev the first
  // hit on a route compiles it, which can take seconds; a single test covering
  // twenty of those spends its whole budget on the compiler and reports a
  // timeout that looks like an application failure.
  for (const route of ADMIN_ROUTES) {
    test(`${route} renders`, async ({ page }) => {
      const console = collectErrors(page);
      await signIn(page, ACCOUNTS.admin, /admin|redirect/);

      const response = await page.goto(`/ar${route}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} returned ${response?.status()}`).toBeLessThan(400);
      // A rendered admin page always has its own heading; a blank body would
      // pass a status check while showing nothing.
      await expect(page.locator('h1').first()).toBeVisible();

      console.assertClean();
    });
  }
});

test.describe('coach dashboard', () => {
  for (const route of COACH_ROUTES) {
    test(`${route} renders`, async ({ page }) => {
      const console = collectErrors(page);
      await signIn(page, ACCOUNTS.coach, /dash/);

      const response = await page.goto(`/ar${route}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} returned ${response?.status()}`).toBeLessThan(400);
      await expect(page.locator('h1').first()).toBeVisible();

      console.assertClean();
    });
  }

  test('no navigation item points at a route that 404s', async ({ page }) => {
    await signIn(page, ACCOUNTS.coach, /dash/);
    await page.goto('/ar/dash', { waitUntil: 'domcontentloaded' });

    // Items not yet built render inert with a "coming soon" badge rather than
    // as links — so every link that *is* rendered has to resolve.
    const hrefs = await page.locator('nav a[href^="/ar/dash"]').evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href')!),
    );

    expect(hrefs.length).toBeGreaterThan(3);

    for (const href of [...new Set(hrefs)]) {
      const response = await page.goto(href, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${href} is linked but returns ${response?.status()}`).toBeLessThan(
        400,
      );
    }
  });
});

test.describe('404', () => {
  test('an unknown route gets the designed page, not a stack trace', async ({ page }) => {
    const response = await page.goto('/ar/this-route-does-not-exist', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    // The designed 404 carries a way back; Next's default does not.
    await expect(page.getByRole('link').first()).toBeVisible();
  });
});

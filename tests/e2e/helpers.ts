import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for the end-to-end suite.
 *
 * The demo seed (`pnpm tsx prisma/demo.ts`) is the fixture: these accounts
 * exist after seeding and are the same ones a developer clicks through by hand.
 */

export const ACCOUNTS = {
  admin: { email: 'admin@coachmate.app', password: 'Admin@12345' },
  coach: { email: 'ahmed.fitness@demo.coachmate.app', password: 'Demo@12345' },
} as const;

export const COACH_USERNAME = 'ahmed-fitness';

/** Signs in and waits for the post-login router to land somewhere real. */
export async function signIn(
  page: Page,
  account: { email: string; password: string },
  expectUrl: RegExp,
): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/ar/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(expectUrl, { timeout: 45_000 });
}

/**
 * Asserts a page rendered without console errors.
 *
 * Wired per-test rather than globally so a test that *expects* an error can opt
 * out. Most 500s in this app surfaced as a console error long before they
 * surfaced as a visibly broken screen.
 */
export function collectErrors(page: Page): { errors: string[]; assertClean: () => void } {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 300));
  });

  return {
    errors,
    assertClean() {
      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
    },
  };
}

/** A tiny valid PNG, for receipt and photo uploads. */
export const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Scrolls to the bottom and back.
 *
 * The landing and directory pages reveal their content with `whileInView`, so
 * anything below the fold is still at opacity 0 until the viewport has passed
 * over it. Without this a full-page screenshot photographs blank space.
 */
export async function revealAll(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

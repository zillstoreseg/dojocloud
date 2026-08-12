import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * Chromium is pre-installed in this environment at a fixed path, so the config
 * points at it rather than letting Playwright download its own — a `playwright
 * install` here would fetch a browser that is already on disk.
 *
 * Workers are pinned to one. These tests share a database and walk journeys
 * that mutate it (a coach approves a payment, a trainee's status flips), so
 * parallel workers would race each other rather than the code.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'ar-EG',
    // The product is RTL-first; testing it in an LTR viewport would miss the
    // class of bug that only appears when the layout mirrors.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
      },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 180_000,
      },
});

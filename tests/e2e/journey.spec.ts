import { test, expect } from '@playwright/test';
import { ACCOUNTS, COACH_USERNAME, signIn, collectErrors, PIXEL_PNG } from './helpers';

/**
 * The journey the whole product exists to serve.
 *
 * A visitor finds a coach in the public directory, opens their landing page,
 * subscribes with the intake questionnaire, uploads a receipt; an admin
 * approves it; the coach's wallet is credited; the trainee signs in to a
 * portal with their targets computed from the answers they gave.
 *
 * Every step here crosses a boundary that unit tests cannot: a public page to
 * a server action, a server action to an admin queue, an admin decision to a
 * ledger entry, and a ledger entry to a screen in a different account. This is
 * the test that would notice if any of those seams came apart.
 *
 * It writes real rows, so it cleans up after itself at the end.
 */

const RUN = Date.now().toString().slice(-8);
const TRAINEE = {
  name: `متدرب اختبار ${RUN}`,
  phone: `0100${RUN}`,
  email: `e2e-${RUN}@test.coachmate.app`,
  password: 'E2e@123456',
};

test.describe.configure({ mode: 'serial' });

test('a visitor finds a coach and subscribes', async ({ page }) => {
  const console = collectErrors(page);

  // ── the directory ──
  await page.goto('/ar/coaches', { waitUntil: 'networkidle' });
  await expect(page.getByText('أحمد سيد').first()).toBeVisible();

  // ── the landing page ──
  await page.goto(`/ar/c/${COACH_USERNAME}`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();

  // ── the join wizard ──
  await page.goto(`/ar/join/${COACH_USERNAME}`, { waitUntil: 'networkidle' });

  await page.locator('button, [role="button"]').filter({ hasText: 'باقة شهر' }).first().click();
  const next = async () => {
    await page.getByRole('button', { name: 'التالي' }).first().click();
    await page.waitForTimeout(500);
  };
  await next();

  await page.fill('#j-name', TRAINEE.name);
  await page.fill('#j-phone', TRAINEE.phone);
  await page.fill('#j-email', TRAINEE.email);
  await page.fill('#j-pass', TRAINEE.password);
  await page.fill('#j-dob', '1994-06-15');
  await next();

  await page.fill('#j-h', '175');
  await page.fill('#j-w', '85');
  await next();
  await next(); // training
  await next(); // health
  await next(); // food & lifestyle

  // ── review, then pay ──
  await expect(page.getByText(TRAINEE.name)).toBeVisible();
  await page.getByRole('button', { name: /أكمل للدفع/ }).first().click();
  await page.waitForTimeout(2500);

  // ── receipt ──
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  });
  await page.waitForTimeout(3000);
  await expect(page.getByText(/قيد المراجعة|وصل|استلمنا/).first()).toBeVisible();

  console.assertClean();
});

test('an admin approves the receipt and the coach is credited', async ({ page }) => {
  const console = collectErrors(page);
  await signIn(page, ACCOUNTS.admin, /admin|redirect/);

  await page.goto('/ar/admin/activations', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /اشتراكات المتدربين/ }).click();
  await page.waitForTimeout(1200);

  // Find this run's entry specifically, so a stray pending row from another
  // test does not make this one pass for the wrong reason. The queue renders
  // each entry as a card rather than a table row, so the card is located by
  // being the innermost element that holds both the name and its own approve
  // button — `.last()` on a chain of nested matches is the innermost one.
  const card = page
    .locator('div')
    .filter({ hasText: TRAINEE.name })
    .filter({ has: page.getByRole('button', { name: 'اعتماد' }) })
    .last();

  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'اعتماد' }).click();
  await page.waitForTimeout(3500);

  // The entry leaves the queue once it is approved.
  await expect(page.getByText(TRAINEE.name)).toHaveCount(0);

  // The wallet is the proof that approval did more than flip a status.
  await signIn(page, ACCOUNTS.coach, /dash/);
  await page.goto('/ar/dash/wallet', { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();
  // A credit sits in the held balance until the hold window matures.
  await expect(page.getByText(/محجوز|قيد الانتظار/).first()).toBeVisible();

  console.assertClean();
});

test('the trainee signs in and sees targets computed from their answers', async ({ page }) => {
  const console = collectErrors(page);

  await signIn(page, { email: TRAINEE.email, password: TRAINEE.password }, /\/ar\/my$/);
  await page.waitForTimeout(1500);

  // 175cm, 85kg, born 1994, moderate activity, weight loss — the target is a
  // specific number, and the point is that it is *not* a placeholder.
  const body = await page.locator('body').innerText();
  const target = body.match(/من (\d{4}) سعر/)?.[1];
  expect(target, 'no calorie target rendered').toBeTruthy();
  expect(Number(target)).toBeGreaterThan(1200);
  expect(Number(target)).toBeLessThan(4000);

  // Latin numerals throughout — Arabic-Indic digits render in a different
  // font and break the line.
  expect(body).not.toMatch(/[٠-٩]/);

  for (const route of ['/my/program', '/my/nutrition', '/my/measurements', '/my/subscription']) {
    const response = await page.goto(`/ar${route}`, { waitUntil: 'networkidle' });
    expect(response?.status(), `${route} returned ${response?.status()}`).toBeLessThan(400);
    await expect(page.locator('h1').first()).toBeVisible();
  }

  console.assertClean();
});

test('the trainee records a measurement', async ({ page }) => {
  const console = collectErrors(page);
  await signIn(page, { email: TRAINEE.email, password: TRAINEE.password }, /\/ar\/my$/);

  await page.goto('/ar/my/measurements', { waitUntil: 'networkidle' });
  await page.fill('#m-weightKg', '84.2');
  await page.fill('#m-waistCm', '92');
  await page.getByRole('button', { name: 'احفظ' }).click();
  await page.waitForTimeout(2500);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText('84.2').first()).toBeVisible();

  console.assertClean();
});

test.afterAll(async () => {
  // Journey tests write real rows; leaving them behind would pollute the
  // directory counters and the admin's figures for every later run.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const trainee = await prisma.trainee.findFirst({
      where: { fullName: TRAINEE.name },
      select: { id: true, userId: true },
    });
    if (trainee) {
      await prisma.traineeSubscription.deleteMany({ where: { traineeId: trainee.id } });
      await prisma.trainee.delete({ where: { id: trainee.id } });
      if (trainee.userId) {
        await prisma.notification.deleteMany({ where: { userId: trainee.userId } });
        await prisma.user.delete({ where: { id: trainee.userId } });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
});

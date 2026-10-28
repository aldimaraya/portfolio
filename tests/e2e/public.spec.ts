import { test, expect } from '@playwright/test';

/**
 * Smoke coverage for the public site. Deliberately independent of what is in the
 * database: these run against the live Neon instance, so anything asserting a
 * particular photo or post would start failing the next time content changes.
 */

test('the root is a home page that leads on to each surface', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  // Each section's way on is only drawn when that surface has content, so this
  // asserts the newsletter signup, which is always there, and nothing else.
  await expect(page.getByRole('heading', { name: 'Get new things by email' })).toBeVisible();
});

test('the three public tabs are navigable, and back again', async ({ page }) => {
  await page.goto('/stills');

  // exact, because the wordmark link's accessible name is the site name plus the
  // tagline, and a substring match on a tab label can find that too.
  await page.getByRole('link', { name: 'Motion', exact: true }).click();
  await expect(page).toHaveURL(/\/motion$/);

  await page.getByRole('link', { name: 'Journal', exact: true }).click();
  await expect(page).toHaveURL(/\/journal$/);

  await page.getByRole('link', { name: 'Stills', exact: true }).click();
  await expect(page).toHaveURL(/\/stills$/);
});

test('the wordmark returns home from a sub-page', async ({ page }) => {
  await page.goto('/journal');
  // The wordmark's text is SITE_NAME in src/lib/site.ts.
  await page.getByRole('heading', { name: 'Aldi Maraya', level: 1 }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('the active tab is marked for assistive tech', async ({ page }) => {
  await page.goto('/motion');
  await expect(page.locator('a[aria-current="page"]')).toHaveText('Motion');
});

test('the admin area is not linked from the public site', async ({ page }) => {
  for (const path of ['/', '/stills', '/motion', '/journal']) {
    await page.goto(path);
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  }
});

test('a clip on the roll opens its own page, and comes back', async ({ page }) => {
  await page.goto('/motion');

  const rows = page.locator('ul a[href^="/motion/"]');
  if ((await rows.count()) === 0) test.skip(true, 'No clips on the roll');

  await rows.first().click();
  await expect(page).toHaveURL(/\/motion\/[^/]+$/);

  // The clip is there and addressable. Whether it is *running* is deliberately
  // not asserted: autoplay is a request every browser is free to refuse, and
  // headless Chromium does refuse it, so a test that demanded playback would be
  // testing the runner's policy rather than the page. What must hold either way
  // is that the visitor can start it — the control is there when it was refused
  // and gone once it is running.
  await expect(page.locator('video')).toHaveCount(1);
  const stage = page.locator('.clip-stage');
  const playing = (await stage.getAttribute('data-playing')) === 'true';
  await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(playing ? 0 : 1);

  await page.getByRole('link', { name: /Back to the roll/ }).click();
  await expect(page).toHaveURL(/\/motion$/);
});

test('a clip can be liked, and the like taken back', async ({ page }) => {
  await page.goto('/motion');

  const rows = page.locator('ul a[href^="/motion/"]');
  if ((await rows.count()) === 0) test.skip(true, 'No clips on the roll');

  await rows.first().click();
  await expect(page).toHaveURL(/\/motion\/[^/]+$/);

  // Disabled until the counts arrive after hydration, so this is also the check
  // that they do. A fresh browser context has no visitor cookie, so it starts
  // unliked whatever anyone else has done.
  const like = page.getByRole('button', { name: /^Like/ });
  await expect(like).toBeEnabled();
  await expect(like).toHaveAttribute('aria-pressed', 'false');

  // Round trip, and it must end where it started: this runs against the live
  // database, so a like left behind would be a real one.
  const saved = page.waitForResponse((response) => response.url().endsWith('/api/engagement/like'));
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  expect((await saved).ok()).toBe(true);

  const removed = page.waitForResponse((response) => response.url().endsWith('/api/engagement/like'));
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  expect((await removed).ok()).toBe(true);
});

test('an unknown clip id is a 404', async ({ page }) => {
  const response = await page.goto('/motion/no-such-clip-exists');
  expect(response?.status()).toBe(404);
});

test('an unknown journal slug is a 404', async ({ page }) => {
  const response = await page.goto('/journal/no-such-post-exists');
  expect(response?.status()).toBe(404);
});

test('every journal entry links to its own post', async ({ page }) => {
  await page.goto('/journal');

  // Passes on an empty journal too — the point is that nothing in the list ever
  // links somewhere other than a post page.
  const links = page.locator('main a[href^="/journal/"]');
  for (let index = 0; index < (await links.count()); index++) {
    await expect(links.nth(index)).toHaveAttribute('href', /^\/journal\/[^/]+$/);
  }
});

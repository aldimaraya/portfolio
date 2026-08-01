import { test, expect } from '@playwright/test';

/**
 * Smoke coverage for the public site. Deliberately independent of what is in the
 * database: these run against the live Neon instance, so anything asserting a
 * particular photo or post would start failing the next time content changes.
 */

test('the root redirects to the stills wall', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/stills$/);
});

test('the three public tabs are navigable, and back again', async ({ page }) => {
  await page.goto('/stills');

  // exact, because the wordmark's accessible name is "Aldi Motion and Stills" —
  // a substring match on a tab label finds it too.
  await page.getByRole('link', { name: 'Motion', exact: true }).click();
  await expect(page).toHaveURL(/\/motion$/);

  await page.getByRole('link', { name: 'Journal', exact: true }).click();
  await expect(page).toHaveURL(/\/journal$/);

  await page.getByRole('link', { name: 'Stills', exact: true }).click();
  await expect(page).toHaveURL(/\/stills$/);
});

test('the wordmark returns home from a sub-page', async ({ page }) => {
  await page.goto('/journal');
  await page.getByRole('heading', { name: 'Aldi', level: 1 }).click();
  await expect(page).toHaveURL(/\/stills$/);
});

test('the active tab is marked for assistive tech', async ({ page }) => {
  await page.goto('/motion');
  await expect(page.locator('a[aria-current="page"]')).toHaveText('Motion');
});

test('the admin area is not linked from the public site', async ({ page }) => {
  for (const path of ['/stills', '/motion', '/journal']) {
    await page.goto(path);
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  }
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

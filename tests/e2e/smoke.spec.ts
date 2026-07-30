import { test, expect } from '@playwright/test';

/**
 * Scaffold-level smoke tests. The real coverage (admin login, create-photo flow)
 * lands in plan Task 19.
 */
test('the root redirects to the stills wall', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/stills$/);
});

test('the three public tabs are navigable', async ({ page }) => {
  await page.goto('/stills');

  await page.getByRole('link', { name: 'Motion' }).click();
  await expect(page).toHaveURL(/\/motion$/);

  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page).toHaveURL(/\/journal$/);
});

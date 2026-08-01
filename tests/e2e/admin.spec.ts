import { test, expect, type Page } from '@playwright/test';

/**
 * Auth and admin-shell smoke tests.
 *
 * Two things can make these unrunnable, and each is detected and reported rather
 * than skipped silently — a suite that quietly runs nothing looks identical to
 * one that passes:
 *
 * - `DEV_SKIP_AUTH=true` leaves /admin ungated, so there is no redirect to
 *   assert. Detected live, because the flag lives in the server's environment.
 * - `E2E_ADMIN_PASSWORD` unset, or not matching `ADMIN_PASSWORD_HASH`, means no
 *   session can be established.
 */

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

/** True when the server is letting /admin through without a session. */
async function authBypassed(page: Page): Promise<boolean> {
  const response = await page.request.get('/admin', { maxRedirects: 0 });
  return response.status() < 300 || response.status() >= 400;
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the login form renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('a wrong password is rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Password').fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // role=alert rather than the text alone: a rejected login has to announce
  // itself, not just print somewhere on the page. Scoped to the form because
  // Next's own route announcer is also a role=alert.
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'That password is incorrect',
  );
  await expect(page).toHaveURL(/\/login/);
});

test('an empty password never reaches the server', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('unauthenticated visitors are redirected to login', async ({ page }) => {
  test.skip(await authBypassed(page), 'DEV_SKIP_AUTH is on — /admin is ungated');

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('the requested admin path is carried through the login redirect', async ({ page }) => {
  test.skip(await authBypassed(page), 'DEV_SKIP_AUTH is on — /admin is ungated');

  await page.goto('/admin/videos');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fvideos/);
});

test.describe('signed in', () => {
  test.skip(!PASSWORD, 'Set E2E_ADMIN_PASSWORD to run the signed-in tests');

  test('the correct password opens the dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('link', { name: 'Photos' })).toBeVisible();
  });

  test('every admin section is reachable', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);

    for (const [label, path] of [
      ['Photos', '/admin/photos'],
      ['Videos', '/admin/videos'],
      ['Posts', '/admin/posts'],
    ]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test('the photo form refuses to save until it is complete', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/photos');

    // The button is disabled rather than clickable-then-rejected, so the guard
    // is the disabled state plus the hint explaining it — clicking would assert
    // nothing.
    await expect(page.getByRole('button', { name: 'Save photo' })).toBeDisabled();
    await expect(
      page.getByText('Still needs a photo, a location and a camera.'),
    ).toBeVisible();
  });

  test('signing out closes the session', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    // The cookie is gone, so the gate applies again — unless it was never on.
    test.skip(await authBypassed(page), 'DEV_SKIP_AUTH is on — /admin is ungated');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});

import { test, expect, type Page } from '@playwright/test';

/**
 * Auth and admin-shell smoke tests.
 *
 * The gate is unconditional now — the `DEV_SKIP_AUTH` bypass these tests used to
 * detect and skip around is gone — so everything below always runs and always
 * asserts, except the signed-in block.
 *
 * That one still depends on `E2E_ADMIN_PASSWORD` being set and matching
 * `ADMIN_PASSWORD_HASH`, without which no session can be established. It reports
 * itself as skipped rather than passing quietly: a suite that runs nothing looks
 * identical to one that succeeds.
 */

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

/** The admin chrome's own nav, as opposed to links in the page body. */
function adminNav(page: Page) {
  return page.getByRole('navigation');
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Waits for the redirect, not just the click: the session cookie arrives with
  // the login response, so navigating on before it lands bounces straight back
  // to /login — and only when the gate is actually on, which is exactly the
  // configuration these tests exist to cover.
  await page.waitForURL('**/admin', { timeout: 60_000 });
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
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('the requested admin path is carried through the login redirect', async ({ page }) => {
  await page.goto('/admin/videos');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fvideos/);
});

test.describe('signed in', () => {
  test.skip(!PASSWORD, 'Set E2E_ADMIN_PASSWORD to run the signed-in tests');

  test('the correct password opens the dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);
    // Scoped to the nav: the dashboard also links each section from a summary
    // card, whose accessible name ("Photos 12 Ordered automatically by colour")
    // contains the label too.
    await expect(adminNav(page).getByRole('link', { name: 'Photos' })).toBeVisible();
  });

  test('every admin section is reachable', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);

    for (const [label, path] of [
      ['Photos', '/admin/photos'],
      ['Videos', '/admin/videos'],
      ['Posts', '/admin/posts'],
    ]) {
      await adminNav(page).getByRole('link', { name: label }).click();
      // Generous, because a dev server compiles each admin route the first time
      // it is asked for and the default 5s expires mid-build on a cold start.
      await page.waitForURL(`**${path}`, { timeout: 60_000 });
    }
  });

  test('the photo form waits for a photo before asking anything about it', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/photos');

    // Every field below the picker describes a picture, so until one is chosen
    // there is nothing to fill in and nothing to save.
    await expect(page.getByRole('button', { name: 'Save photo' })).toBeHidden();
    await expect(page.getByLabel('Location')).toBeHidden();
    await expect(page.getByLabel('Camera')).toBeHidden();
    await expect(page.getByText('Drag a file here, or')).toBeVisible();
  });

  test('signing out closes the session', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    // The cookie is gone, so the gate applies again.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});

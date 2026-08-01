import { test, expect, type Page } from '@playwright/test';

/**
 * The page transition, asserted through what the browser actually computed
 * rather than the presence of a class name — a class proves the markup, not that
 * any animation is attached to it.
 */

function animationOf(page: Page) {
  return page.locator('.page-enter').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      name: style.animationName,
      duration: style.animationDuration,
      fill: style.animationFillMode,
    };
  });
}

test('public pages animate in', async ({ page }) => {
  await page.goto('/stills');
  expect(await animationOf(page)).toMatchObject({
    name: 'page-enter',
    duration: '0.28s',
  });
});

test('the header sits outside the transition', async ({ page }) => {
  await page.goto('/stills');
  // Chrome that re-animates on every navigation reads as a full page reload.
  const headerInside = await page.locator('.page-enter header').count();
  expect(headerInside).toBe(0);
});

test('the animation re-runs on navigation, not just first load', async ({ page }) => {
  await page.goto('/stills');
  const before = await page.locator('.page-enter').first().getAttribute('class');

  await page.getByRole('link', { name: 'Journal', exact: true }).click();
  await expect(page).toHaveURL(/\/journal$/);

  // The wrapper is keyed on the pathname, so navigating replaces the element.
  // Same class, new node — which is what makes the CSS animation fire again.
  expect(await page.locator('.page-enter').first().getAttribute('class')).toBe(before);
  expect(await animationOf(page)).toMatchObject({ name: 'page-enter' });
});

test('it settles to no transform, leaving sticky positioning intact', async ({ page }) => {
  await page.goto('/motion');

  const transform = await page
    .locator('.page-enter')
    .first()
    .evaluate(async (element) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return getComputedStyle(element).transform;
    });

  // A lingering transform of any value makes this the containing block for
  // fixed descendants — including an identity matrix, which is what a `forwards`
  // fill leaves behind even when the last keyframe says `transform: none`.
  expect(transform).toBe('none');
});

test('the film strip still sticks while the roll scrolls', async ({ page }) => {
  await page.goto('/motion');

  const sticky = page.locator('.sticky').first();
  if ((await sticky.count()) === 0) test.skip(true, 'No film strip on the page');

  // Scroll once to engage it: measuring from the top of the page would only
  // catch it travelling from its natural position into its stuck one, which is
  // the behaviour rather than a break.
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  const stuck = await sticky.boundingBox();

  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  const stillStuck = await sticky.boundingBox();

  // Now it must hold its place in the viewport as the page scrolls on past.
  expect(Math.abs((stillStuck?.y ?? 0) - (stuck?.y ?? 0))).toBeLessThan(4);
});

test.describe('reduced motion', () => {
  // emulateMedia per test rather than `test.use({ reducedMotion })` at describe
  // level, which did not reach the page here — matchMedia still reported
  // no-preference, and every assertion below would have passed vacuously
  // against the ordinary animation.
  test('drops the drift but keeps a short dissolve', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/stills');
    expect(await animationOf(page)).toMatchObject({
      name: 'page-fade',
      duration: '0.12s',
    });
  });

  test('still suppresses the looping sprite previews', async ({ page }) => {
    // Guards the pre-existing rule at the same time: both live in one media
    // query, so a careless edit to either can silently drop the other.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/motion');
    const strip = page.locator('.sprite-strip').first();
    if ((await strip.count()) === 0) test.skip(true, 'No clips to preview');
    expect(await strip.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

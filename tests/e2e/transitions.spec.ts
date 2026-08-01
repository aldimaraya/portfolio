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

test.describe('the stills wall', () => {
  test('staggers each frame in, capped so the wall never crawls', async ({ page }) => {
    await page.goto('/stills');

    const items = page.locator('.stagger-in');
    const count = await items.count();
    if (count === 0) test.skip(true, 'No photos on the wall');

    const delays = await items.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationDelay),
    );

    expect(delays[0]).toBe('0s');
    if (count > 1) expect(delays[1]).toBe('0.045s');

    // Nothing waits longer than the cap, however many photos are on the wall.
    for (const delay of delays) {
      expect(Number.parseFloat(delay)).toBeLessThanOrEqual(0.45);
    }
  });

  test('every frame settles to no transform', async ({ page }) => {
    await page.goto('/stills');
    const items = page.locator('.stagger-in');
    if ((await items.count()) === 0) test.skip(true, 'No photos on the wall');

    await page.waitForTimeout(1200);
    const transforms = await items.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).transform),
    );
    expect(transforms.every((transform) => transform === 'none')).toBe(true);
  });
});

test.describe('scroll reveal', () => {
  test('holds back frames below the fold, and releases them on scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/stills');

    // The hold is applied by an effect, so it does not exist at first paint —
    // counting immediately after goto reads zero and skips the whole test.
    const pending = page.locator('.stagger-in[data-pending="true"]');
    await expect.poll(async () => pending.count(), { timeout: 5000 }).toBeGreaterThan(0);
    const held = await pending.count();

    // Anything already on screen keeps its entry stagger — only what is out of
    // sight waits, or the first paint would blink out to be revealed again.
    const firstItem = page.locator('.stagger-in').first();
    expect(await firstItem.getAttribute('data-pending')).toBeNull();

    await page.mouse.wheel(0, 2000);
    await expect
      .poll(async () => pending.count(), { timeout: 5000 })
      .toBeLessThan(held);
  });

  test('a revealed frame ends up fully visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/stills');

    const items = page.locator('.stagger-in');
    if ((await items.count()) < 2) test.skip(true, 'Not enough photos');

    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(1200);

    const last = items.last();
    expect(await last.getAttribute('data-pending')).toBeNull();
    expect(await last.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
  });
});

test.describe('filtering the wall', () => {
  test('surviving frames slide to their new places', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/stills');
    await page.waitForTimeout(800);

    const chips = page.locator('[aria-pressed]');
    if ((await chips.count()) === 0) test.skip(true, 'No filters available');

    // Counted every frame: the re-flow is a WAAPI animation a few hundred
    // milliseconds long, and a single reading after the navigation settles
    // would land after it finished either way.
    await page.evaluate(() => {
      Object.assign(window, { __peak: 0 });
      let frames = 0;
      const tick = () => {
        const running = [...document.querySelectorAll('.stagger-in')].filter((node) =>
          node.getAnimations().some((animation) => animation.playState === 'running'),
        ).length;
        const w = window as unknown as { __peak: number };
        w.__peak = Math.max(w.__peak, running);
        if (++frames < 200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await chips.first().click();
    await page.waitForTimeout(2000);

    const peak = await page.evaluate(
      () => (window as unknown as { __peak: number }).__peak,
    );
    // More than one at once distinguishes a re-flow from a single frame simply
    // running its entry animation.
    expect(peak).toBeGreaterThan(1);
  });
});

test.describe('the lightbox', () => {
  test('scales in when opened', async ({ page }) => {
    await page.goto('/stills');
    const first = page.locator('.stagger-in button, .stagger-in').first();
    if ((await first.count()) === 0) test.skip(true, 'No photos on the wall');

    await first.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => getComputedStyle(node).animationName)).toBe(
      'lightbox-in',
    );
  });

  test('plays its exit before unmounting rather than vanishing', async ({ page }) => {
    await page.goto('/stills');
    const first = page.locator('.stagger-in').first();
    if ((await first.count()) === 0) test.skip(true, 'No photos on the wall');

    await first.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    // Still on screen, now running the exit — the overlay has to outlive the
    // decision to close or there is nothing left to animate.
    await expect(dialog).toHaveAttribute('data-closing', 'true');
    expect(await dialog.evaluate((node) => getComputedStyle(node).animationName)).toBe(
      'lightbox-out',
    );

    // And then it really does go, rather than being left behind mid-fade.
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
  });

  test('closing restores scrolling behind it', async ({ page }) => {
    await page.goto('/stills');
    const first = page.locator('.stagger-in').first();
    if ((await first.count()) === 0) test.skip(true, 'No photos on the wall');

    await first.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });

    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
});

test.describe('the film strip', () => {
  test('staggers its frames like the wall', async ({ page }) => {
    await page.goto('/motion');

    const frames = page.locator('.stagger-in');
    const count = await frames.count();
    if (count === 0) test.skip(true, 'No clips');

    const delays = await frames.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationDelay),
    );
    expect(delays[0]).toBe('0s');
    if (count > 1) expect(delays[1]).toBe('0.045s');
  });
});

test.describe('the tab underline', () => {
  test('sits under the active tab', async ({ page }) => {
    await page.goto('/motion');

    const bar = page.getByTestId('tab-underline');
    const tab = page.getByRole('link', { name: 'Motion', exact: true });
    const barBox = await bar.boundingBox();
    const tabBox = await tab.boundingBox();

    expect(Math.abs((barBox?.x ?? 0) - (tabBox?.x ?? 0))).toBeLessThan(2);
    expect(Math.abs((barBox?.width ?? 0) - (tabBox?.width ?? 0))).toBeLessThan(2);
  });

  test('slides to the next tab rather than jumping', async ({ page }) => {
    await page.goto('/stills');

    // Sampled every frame from inside the page rather than polled from the test:
    // a fixed delay races the dev server's navigation, and arriving late looks
    // exactly like a jump. The bar survives navigation — the header sits outside
    // the page transition — so one element can be watched throughout.
    // The bar only exists once the measuring effect has run, so wait for it
    // before sampling — and re-query each frame rather than closing over the
    // node, so a remount would show up as missing samples instead of stale ones.
    await page.getByTestId('tab-underline').waitFor();
    await page.evaluate(() => {
      const samples: number[] = [];
      Object.assign(window, { __barSamples: samples });
      let frames = 0;
      const tick = () => {
        const bar = document.querySelector('[data-testid="tab-underline"]');
        if (bar) samples.push(bar.getBoundingClientRect().x);
        if (++frames < 150) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.getByRole('link', { name: 'Journal', exact: true }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await page.waitForTimeout(700);

    const samples: number[] = await page.evaluate(
      () => (window as unknown as { __barSamples: number[] }).__barSamples,
    );
    const distinct = [...new Set(samples.map((x) => Math.round(x)))];

    // A jump produces two positions, start and end. Travelling produces a run of
    // them; 300ms at 60fps leaves plenty of room above this floor.
    expect(distinct.length).toBeGreaterThan(4);
    expect(distinct.at(-1)).toBeGreaterThan(distinct[0]);
  });

  test('there is exactly one underline, not one per tab', async ({ page }) => {
    await page.goto('/stills');
    await expect(page.getByTestId('tab-underline')).toHaveCount(1);
  });
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

  test('flattens the wall stagger', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/stills');

    const items = page.locator('.stagger-in');
    if ((await items.count()) === 0) test.skip(true, 'No photos on the wall');

    const delays = await items.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationDelay),
    );
    // Arrival spread over half a second is motion in its own right.
    expect(delays.every((delay) => delay === '0s')).toBe(true);
  });

  test('never hides a frame behind the scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/stills');
    await page.waitForTimeout(300);

    // Withholding content until it is scrolled to is motion in its own right,
    // so the whole wall arrives at once.
    await expect(page.locator('.stagger-in[data-pending="true"]')).toHaveCount(0);
  });

  test('drops the underline slide and the row shift', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/stills');

    const barTransition = await page
      .getByTestId('tab-underline')
      .evaluate((node) => getComputedStyle(node).transitionDuration);
    expect(['0s', '']).toContain(barTransition);
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

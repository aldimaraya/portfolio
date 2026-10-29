import type { PhotoLayout } from './content';

/**
 * How wide a photos block is drawn. Two limits, and the narrower wins: the
 * block's own `scale` — a share of the width its size gives it, set by dragging
 * in the editor — and a height cap, so a portrait never runs taller than the
 * screen. At column width a 2:3 portrait is a thousand pixels tall; without the
 * cap every vertical photo had to be shrunk by hand to fit on a laptop.
 *
 * The cap is a width, not a max-height: the width is what the caption, the row
 * packing and the editor's handles all hang off, and a max-height on the image
 * would leave the figure (and its caption) at full width beside a narrow photo.
 */

/** The tallest a photo is drawn. svh, so a phone's collapsing toolbar does not resize it. */
export const MAX_PHOTO_HEIGHT = '80svh';

export const MIN_SCALE = 20;
export const MAX_SCALE = 100;
/** Drag and arrow keys move in steps of this, so a block lands on 45%, not 43.7%. */
export const SCALE_STEP = 5;

/** The gap between photos in a row, in rem — .post-photo-row's `gap`. */
const ROW_GAP_REM = 0.5;

/** A photo's width over its height. An image of unknown size (one never in our tables) counts as 3:2. */
export function aspect(image: { width: number; height: number }): number {
  return image.width > 0 && image.height > 0 ? image.width / image.height : 1.5;
}

/** A scale snapped to the step and held inside its range. */
export function clampScale(value: number): number {
  const stepped = Math.round(value / SCALE_STEP) * SCALE_STEP;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, stepped));
}

/** Ratios go into CSS; four places is well under a pixel at any width. */
const fixed = (value: number) => Number(value.toFixed(4));

/** The width at which a photo of this ratio is exactly MAX_PHOTO_HEIGHT tall. */
export function heightCap(ratio: number): string {
  return `calc(${MAX_PHOTO_HEIGHT} * ${fixed(ratio)})`;
}

/**
 * The figure's CSS width, or undefined to leave it at the full width of its
 * row. A grid's cells are square and a carousel's slides 3:2 whatever the
 * photos are, so only stacked photos and rows have a height to cap.
 */
export function figureWidth(layout: PhotoLayout, ratios: number[], scale: number = MAX_SCALE): string | undefined {
  const share = scale < MAX_SCALE ? `${scale}%` : '100%';
  let cap: string | undefined;
  if (ratios.length && layout === 'stacked') {
    // Each photo is capped on its own (photoWidth); the figure only needs to be
    // as wide as the widest of them.
    cap = heightCap(Math.max(...ratios));
  } else if (ratios.length && layout === 'row') {
    // A justified row's height is its width over the sum of its ratios, once the
    // gaps are taken out — so the gaps go back on here.
    const total = ratios.reduce((sum, ratio) => sum + ratio, 0);
    const gaps = fixed(ROW_GAP_REM * (ratios.length - 1));
    cap = gaps ? `calc(${MAX_PHOTO_HEIGHT} * ${fixed(total)} + ${gaps}rem)` : heightCap(total);
  }
  if (cap) return `min(${share}, ${cap})`;
  return scale < MAX_SCALE ? share : undefined;
}

/** One stacked photo's width, so a portrait among landscapes is held to the cap too. */
export function photoWidth(ratio: number): string {
  return `min(100%, ${heightCap(ratio)})`;
}

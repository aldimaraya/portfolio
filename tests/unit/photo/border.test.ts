import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BORDER_OPTIONS,
  cropRect,
  detectBorderInsets,
  hasBorder,
  scaleInsets,
  type PixelGrid,
} from '@/lib/photo/border';

type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];
const DARK: RGB = [40, 60, 90];

/** Builds a grid of `fill` with a `border`-wide frame of `frame` around it. */
function framed(
  width: number,
  height: number,
  border: { top: number; right: number; bottom: number; left: number },
  frame: RGB = WHITE,
  fill: RGB = DARK,
): PixelGrid {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inFrame =
        y < border.top ||
        y >= height - border.bottom ||
        x < border.left ||
        x >= width - border.right;
      const [r, g, b] = inFrame ? frame : fill;
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('detectBorderInsets', () => {
  it('finds an even white frame', () => {
    const grid = framed(100, 100, { top: 8, right: 8, bottom: 8, left: 8 });
    expect(detectBorderInsets(grid)).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
  });

  it('measures each side independently', () => {
    const grid = framed(100, 120, { top: 4, right: 9, bottom: 14, left: 2 });
    expect(detectBorderInsets(grid)).toEqual({ top: 4, right: 9, bottom: 14, left: 2 });
  });

  it('reports nothing for an image with no frame', () => {
    const grid = framed(50, 50, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(hasBorder(detectBorderInsets(grid))).toBe(false);
  });

  it('tolerates a few stray pixels along the frame, as JPEG ringing leaves', () => {
    const grid = framed(200, 200, { top: 10, right: 10, bottom: 10, left: 10 });
    // Two dark pixels in an otherwise white row — under the 3% miss allowance.
    grid.data[(3 * 200 + 40) * 4] = 10;
    grid.data[(3 * 200 + 41) * 4] = 10;
    expect(detectBorderInsets(grid).top).toBe(10);
  });

  it('leaves a bright but coloured edge alone', () => {
    // A blown-out sky: bright, yet far from neutral.
    const grid = framed(80, 80, { top: 6, right: 6, bottom: 6, left: 6 }, [255, 240, 205]);
    expect(hasBorder(detectBorderInsets(grid))).toBe(false);
  });

  it('never trims past the guard ratio, even on an all-white image', () => {
    const grid = framed(100, 100, { top: 100, right: 100, bottom: 100, left: 100 });
    const insets = detectBorderInsets(grid);
    const limit = Math.floor(100 * DEFAULT_BORDER_OPTIONS.maxInsetRatio);
    expect(insets).toEqual({ top: limit, right: limit, bottom: limit, left: limit });
  });

  it('treats fully transparent margins as border', () => {
    const grid = framed(60, 60, { top: 5, right: 5, bottom: 5, left: 5 });
    for (let x = 0; x < 60; x += 1) grid.data[(0 * 60 + x) * 4 + 3] = 0;
    expect(detectBorderInsets(grid).top).toBe(5);
  });

  it('returns no border for an empty grid', () => {
    expect(
      detectBorderInsets({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('cropRect', () => {
  it('cuts the insets off each side', () => {
    expect(cropRect(100, 80, { top: 5, right: 10, bottom: 5, left: 10 })).toEqual({
      x: 10,
      y: 5,
      width: 80,
      height: 70,
    });
  });

  it('clamps insets that would collapse the image', () => {
    const rect = cropRect(20, 20, { top: 40, right: 40, bottom: 40, left: 40 });
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('ignores negative insets rather than growing the crop', () => {
    expect(cropRect(50, 50, { top: -5, right: 0, bottom: 0, left: -5 })).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
  });
});

describe('scaleInsets', () => {
  it('rounds down, so the crop errs towards leaving frame behind', () => {
    expect(scaleInsets({ top: 3, right: 3, bottom: 3, left: 3 }, 2.5)).toEqual({
      top: 7,
      right: 7,
      bottom: 7,
      left: 7,
    });
  });
});

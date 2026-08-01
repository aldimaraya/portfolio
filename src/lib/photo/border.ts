/**
 * Detects a baked-in white border — the printed-photo frame some exports carry —
 * so it can be cropped away. Pure and pixel-array based, so it is unit-testable
 * and runs unchanged over a canvas ImageData in the browser.
 *
 * The frame is only ever cropped, never painted over: everything here returns
 * insets for the caller to cut with.
 */

export interface BorderInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_BORDER: BorderInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface BorderOptions {
  /** Minimum channel value for a pixel to count as border-white. */
  minBrightness: number;
  /**
   * Maximum spread between a pixel's channels. A white frame is neutral, so this
   * is what stops a blown-out sky — bright but faintly blue — being eaten.
   */
  maxChroma: number;
  /**
   * Fraction of a line that must be border-white for the line to be border. Not
   * 1: JPEG ringing along the frame's inner edge leaves a few stray pixels, and
   * demanding every one of them would report no border at all on a real export.
   */
  minLineRatio: number;
  /**
   * Largest share of each axis that may be trimmed. A guard against a genuinely
   * high-key photo — snow, studio white — being consumed edge to edge.
   */
  maxInsetRatio: number;
}

export const DEFAULT_BORDER_OPTIONS: BorderOptions = {
  minBrightness: 235,
  maxChroma: 14,
  minLineRatio: 0.97,
  maxInsetRatio: 0.35,
};

/** RGBA pixels in row-major order, as they come off `ctx.getImageData`. */
export interface PixelGrid {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function isBorderPixel(
  data: Uint8ClampedArray,
  offset: number,
  options: BorderOptions,
): boolean {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  // A fully transparent pixel is not evidence of a frame either way; treating it
  // as border lets a PNG with an alpha margin trim to its real content.
  if (data[offset + 3] === 0) return true;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= options.minBrightness && max - min <= options.maxChroma;
}

/**
 * True when the row at `y` (or, with `axis: 'column'`, the column at `x`) is
 * border-white for at least `minLineRatio` of its length.
 */
function lineIsBorder(
  grid: PixelGrid,
  axis: 'row' | 'column',
  index: number,
  options: BorderOptions,
): boolean {
  const { data, width, height } = grid;
  const length = axis === 'row' ? width : height;
  const needed = Math.ceil(length * options.minLineRatio);
  // Counting misses rather than hits lets the scan bail as soon as the line
  // cannot qualify — most lines inside the photo fail within a few pixels.
  const allowedMisses = length - needed;

  let misses = 0;
  for (let step = 0; step < length; step += 1) {
    const x = axis === 'row' ? step : index;
    const y = axis === 'row' ? index : step;
    if (!isBorderPixel(data, (y * width + x) * 4, options)) {
      misses += 1;
      if (misses > allowedMisses) return false;
    }
  }
  return true;
}

/**
 * Walks inwards from each edge, counting consecutive border lines. Each side is
 * measured independently — scanned frames are rarely even, and a photo cropped
 * to a symmetric inset would sit visibly off-centre.
 */
export function detectBorderInsets(
  grid: PixelGrid,
  options: BorderOptions = DEFAULT_BORDER_OPTIONS,
): BorderInsets {
  const { width, height } = grid;
  if (width <= 0 || height <= 0) return NO_BORDER;

  const maxVertical = Math.floor(height * options.maxInsetRatio);
  const maxHorizontal = Math.floor(width * options.maxInsetRatio);

  let top = 0;
  while (top < maxVertical && lineIsBorder(grid, 'row', top, options)) top += 1;

  let bottom = 0;
  while (bottom < maxVertical && lineIsBorder(grid, 'row', height - 1 - bottom, options)) {
    bottom += 1;
  }

  let left = 0;
  while (left < maxHorizontal && lineIsBorder(grid, 'column', left, options)) left += 1;

  let right = 0;
  while (right < maxHorizontal && lineIsBorder(grid, 'column', width - 1 - right, options)) {
    right += 1;
  }

  return { top, right, bottom, left };
}

export function hasBorder(insets: BorderInsets): boolean {
  return insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Turns insets into a crop rectangle, clamped so it can never collapse: a
 * zero-width canvas throws, and an over-eager inset from a hand-typed value
 * should degrade to "trim less" rather than to an error.
 */
export function cropRect(
  width: number,
  height: number,
  insets: BorderInsets,
): CropRect {
  const left = Math.max(0, Math.min(Math.round(insets.left), width - 1));
  const top = Math.max(0, Math.min(Math.round(insets.top), height - 1));
  const right = Math.max(0, Math.min(Math.round(insets.right), width - 1 - left));
  const bottom = Math.max(0, Math.min(Math.round(insets.bottom), height - 1 - top));

  return {
    x: left,
    y: top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

/**
 * Rescales insets measured on a downsampled copy back to full-resolution pixels,
 * rounding down so the crop errs towards leaving a hair of frame rather than
 * biting into the picture.
 */
export function scaleInsets(insets: BorderInsets, scale: number): BorderInsets {
  return {
    top: Math.floor(insets.top * scale),
    right: Math.floor(insets.right * scale),
    bottom: Math.floor(insets.bottom * scale),
    left: Math.floor(insets.left * scale),
  };
}

import { describe, it, expect } from 'vitest';
import { rgbToOklab, analyzePixels, placeholderColor } from '@/lib/color/analyze';

function pixels(...rgb: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgb.length * 4);
  rgb.forEach(([r, g, b], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

/** `count` copies of one colour, so a test can weight one region against another. */
function fill(count: number, rgb: [number, number, number]): [number, number, number][] {
  return Array.from({ length: count }, () => rgb);
}

describe('rgbToOklab', () => {
  it('spans lightness 0 to 1 from black to white', () => {
    expect(rgbToOklab(0, 0, 0)[0]).toBeCloseTo(0, 5);
    expect(rgbToOklab(255, 255, 255)[0]).toBeCloseTo(1, 5);
  });

  it('puts grey at the origin of the colour plane', () => {
    const [, a, b] = rgbToOklab(128, 128, 128);
    expect(a).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it('rates yellow lighter than blue, unlike HSL', () => {
    // The whole reason for OKLab here: HSL calls both of these lightness 0.5.
    expect(rgbToOklab(255, 255, 0)[0]).toBeGreaterThan(rgbToOklab(0, 0, 255)[0]);
  });

  it('puts red and yellow on the positive b side, blue on the negative', () => {
    expect(rgbToOklab(255, 0, 0)[2]).toBeGreaterThan(0);
    expect(rgbToOklab(255, 255, 0)[2]).toBeGreaterThan(0);
    expect(rgbToOklab(0, 0, 255)[2]).toBeLessThan(0);
  });
});

describe('analyzePixels', () => {
  it('flags a uniformly gray image as monochrome', () => {
    const result = analyzePixels(pixels([90, 90, 90], [200, 200, 200]));
    expect(result.isMonochrome).toBe(true);
    expect(result.avgChroma).toBeCloseTo(0, 4);
  });

  it('reports mid lightness for a black-and-white image', () => {
    const result = analyzePixels(pixels([0, 0, 0], [255, 255, 255]));
    expect(result.avgLightness).toBeCloseTo(0.5, 2);
  });

  it('does not flag a saturated image as monochrome even when its average is gray', () => {
    // Testing the average would call this black-and-white; the RMS is measured
    // per pixel, before red and cyan get the chance to cancel.
    const result = analyzePixels(pixels([255, 0, 0], [0, 255, 255]));
    expect(result.isMonochrome).toBe(false);
    // The average really has mostly cancelled — well under either pixel's own
    // chroma — which is exactly why isMonochrome must not be read off it.
    const red = Math.hypot(...rgbToOklab(255, 0, 0).slice(1));
    expect(result.avgChroma).toBeLessThan(red / 3);
  });

  it('keeps a muted colour photo out of the monochrome band', () => {
    // The threshold's real job: measured across the library, the most desaturated
    // colour frames still sit an order of magnitude above a true B&W.
    const result = analyzePixels(pixels([120, 116, 108], [90, 88, 84], [140, 132, 120]));
    expect(result.isMonochrome).toBe(false);
  });

  it('reports no hue for a neutral image rather than an angle made of noise', () => {
    const result = analyzePixels(pixels([0, 0, 0], [128, 128, 128], [255, 255, 255]));
    expect(result.avgHue).toBe(0);
    expect(result.avgChroma).toBeCloseTo(0, 4);
  });

  it('ignores fully transparent pixels', () => {
    const buf = new Uint8ClampedArray(8);
    buf.set([255, 0, 0, 0], 0);
    buf.set([0, 0, 255, 255], 4);
    expect(analyzePixels(buf).warmth).toBeLessThan(0);
  });

  it('returns safe defaults for an empty buffer', () => {
    expect(analyzePixels(new Uint8ClampedArray(0))).toEqual({
      avgHue: 0,
      avgChroma: 0,
      avgLightness: 0,
      warmth: 0,
      isMonochrome: true,
    });
  });
});

describe('warmth', () => {
  const warmthOf = (...rgb: [number, number, number][]) => analyzePixels(pixels(...rgb)).warmth;

  it('is positive for warm colours and negative for cool ones', () => {
    expect(warmthOf([255, 140, 0])).toBeGreaterThan(0); // amber
    expect(warmthOf([255, 0, 0])).toBeGreaterThan(0); // red is warm too
    expect(warmthOf([0, 80, 255])).toBeLessThan(0); // blue
    expect(warmthOf([0, 200, 200])).toBeLessThan(0); // cyan
  });

  it('makes blue the coldest thing on the wall', () => {
    expect(warmthOf([0, 0, 255])).toBeLessThan(warmthOf([0, 200, 200]));
  });

  it('is zero for a neutral frame', () => {
    expect(warmthOf([0, 0, 0], [128, 128, 128], [255, 255, 255])).toBeCloseTo(0, 4);
  });

  it('lands mid-scale when a cool sky and a warm sunset cancel', () => {
    // The case that broke hue sorting: this frame has no dominant colour, and an
    // honest answer is "neither warm nor cool" rather than an arbitrary angle.
    const split = warmthOf(...fill(20, [90, 150, 230]), ...fill(20, [255, 150, 60]));
    expect(Math.abs(split)).toBeLessThan(Math.abs(warmthOf([255, 150, 60])));
    expect(Math.abs(split)).toBeLessThan(Math.abs(warmthOf([90, 150, 230])));
  });

  it('shifts toward whichever half of the frame is stronger', () => {
    const mostlyWarm = warmthOf(...fill(5, [90, 150, 230]), ...fill(35, [255, 150, 60]));
    const mostlyCool = warmthOf(...fill(35, [90, 150, 230]), ...fill(5, [255, 150, 60]));
    expect(mostlyWarm).toBeGreaterThan(0);
    expect(mostlyCool).toBeLessThan(0);
  });

  it('orders a golden-hour frame above an overcast one above a night one', () => {
    const golden = warmthOf(...fill(20, [255, 190, 120]), ...fill(20, [200, 140, 70]));
    const overcast = warmthOf(...fill(20, [170, 172, 175]), ...fill(20, [120, 124, 130]));
    const night = warmthOf(...fill(20, [20, 30, 70]), ...fill(20, [40, 60, 110]));
    expect(golden).toBeGreaterThan(overcast);
    expect(overcast).toBeGreaterThan(night);
  });
});

describe('placeholderColor', () => {
  it('paints the stored average colour', () => {
    expect(placeholderColor({ avgHue: 210.4, avgChroma: 0.0512, avgLightness: 0.42 })).toBe(
      'oklch(0.420 0.0512 210)',
    );
  });

  it('paints grey for a monochrome photo, without needing to be told', () => {
    expect(placeholderColor({ avgHue: 0, avgChroma: 0, avgLightness: 0.42 })).toBe(
      'oklch(0.420 0.0000 0)',
    );
  });

  it('handles the all-zero stats stored for an unanalysable image', () => {
    expect(placeholderColor({ avgHue: 0, avgChroma: 0, avgLightness: 0 })).toBe(
      'oklch(0.000 0.0000 0)',
    );
  });
});

import { describe, it, expect } from 'vitest';
import { rgbToHsl, analyzePixels } from '@/lib/color/analyze';

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

describe('rgbToHsl', () => {
  it('maps pure red to hue 0', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0);
    expect(s).toBeCloseTo(1);
    expect(l).toBeCloseTo(0.5);
  });

  it('maps pure green to hue 120', () => {
    expect(rgbToHsl(0, 255, 0)[0]).toBeCloseTo(120);
  });

  it('maps pure blue to hue 240', () => {
    expect(rgbToHsl(0, 0, 255)[0]).toBeCloseTo(240);
  });

  it('reports zero saturation for gray', () => {
    expect(rgbToHsl(128, 128, 128)[1]).toBeCloseTo(0);
  });
});

describe('analyzePixels', () => {
  it('flags a uniformly gray image as monochrome', () => {
    const result = analyzePixels(pixels([90, 90, 90], [200, 200, 200]));
    expect(result.isMonochrome).toBe(true);
    expect(result.avgSaturation).toBeCloseTo(0);
  });

  it('reports mid lightness for a black-and-white image', () => {
    const result = analyzePixels(pixels([0, 0, 0], [255, 255, 255]));
    expect(result.avgLightness).toBeCloseTo(0.5);
  });

  it('does not flag a saturated image as monochrome even when its average is gray', () => {
    const result = analyzePixels(pixels([255, 0, 0], [0, 255, 255]));
    expect(result.isMonochrome).toBe(false);
    expect(result.avgSaturation).toBeGreaterThan(0.5);
  });

  it('reports a red-dominant image near hue 0', () => {
    const result = analyzePixels(pixels([220, 30, 30], [200, 40, 20]));
    expect(result.isMonochrome).toBe(false);
    expect(result.avgHue).toBeLessThan(20);
  });

  it('ignores fully transparent pixels', () => {
    const buf = new Uint8ClampedArray(8);
    buf.set([255, 0, 0, 0], 0);
    buf.set([0, 0, 255, 255], 4);
    const result = analyzePixels(buf);
    expect(result.avgHue).toBeCloseTo(240);
  });

  it('returns safe defaults for an empty buffer', () => {
    const result = analyzePixels(new Uint8ClampedArray(0));
    expect(result).toEqual({ avgHue: 0, avgSaturation: 0, avgLightness: 0, isMonochrome: true });
  });
});

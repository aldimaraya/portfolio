import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_DISTANCE,
  findDuplicate,
  fingerprintDistance,
  fingerprintPixels,
  isFingerprint,
} from '@/lib/photo/fingerprint';

/** An RGBA sample whose grey level at each pixel comes from `shade(x, y)`. */
function sample(width: number, height: number, shade: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = shade(x, y);
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return data;
}

/** A scene with some structure: a lit diagonal, a dark disc, a gradient behind. */
const scene = (width: number, height: number) => (x: number, y: number) => {
  const u = x / width;
  const v = y / height;
  const disc = (u - 0.3) ** 2 + (v - 0.6) ** 2 < 0.04 ? -120 : 0;
  return 60 + 120 * u + 60 * Math.sin(8 * (u + v)) + disc;
};

describe('fingerprintPixels', () => {
  it('is 16 hex characters', () => {
    const hash = fingerprintPixels(sample(100, 75, scene(100, 75)), 100, 75);
    expect(isFingerprint(hash)).toBe(true);
  });

  it('reads a left-to-right brightening as every bit clear', () => {
    expect(fingerprintPixels(sample(90, 80, (x) => x * 2), 90, 80)).toBe('0000000000000000');
  });

  it('reads a left-to-right darkening as every bit set', () => {
    expect(fingerprintPixels(sample(90, 80, (x) => 255 - x * 2), 90, 80)).toBe('ffffffffffffffff');
  });

  it('lands the same picture sampled at another size within the duplicate margin', () => {
    // The browser draws its sample with a canvas, the backfill with sharp, and
    // the two never agree pixel for pixel — the hash has to absorb that.
    const a = fingerprintPixels(sample(100, 75, scene(100, 75)), 100, 75)!;
    const b = fingerprintPixels(sample(100, 67, scene(100, 67)), 100, 67)!;
    expect(fingerprintDistance(a, b)).toBeLessThanOrEqual(DUPLICATE_DISTANCE);
  });

  it('survives a uniform shift in exposure', () => {
    const a = fingerprintPixels(sample(100, 75, scene(100, 75)), 100, 75)!;
    const b = fingerprintPixels(sample(100, 75, (x, y) => scene(100, 75)(x, y) * 0.9 + 10), 100, 75)!;
    expect(fingerprintDistance(a, b)).toBeLessThanOrEqual(DUPLICATE_DISTANCE);
  });

  it('tells a mirrored picture apart', () => {
    const a = fingerprintPixels(sample(100, 75, scene(100, 75)), 100, 75)!;
    const b = fingerprintPixels(sample(100, 75, (x, y) => scene(100, 75)(99 - x, y)), 100, 75)!;
    expect(fingerprintDistance(a, b)).toBeGreaterThan(DUPLICATE_DISTANCE);
  });

  it('gives up on a sample with nothing in it', () => {
    expect(fingerprintPixels(new Uint8ClampedArray(0), 0, 0)).toBeNull();
    expect(fingerprintPixels(new Uint8ClampedArray(8), 100, 75)).toBeNull();
  });

  it('still hashes a sample smaller than the 9×8 grid', () => {
    expect(isFingerprint(fingerprintPixels(sample(3, 2, (x) => x * 50), 3, 2))).toBe(true);
  });
});

describe('fingerprintDistance', () => {
  it('counts differing bits', () => {
    expect(fingerprintDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(fingerprintDistance('0000000000000000', '0000000000000003')).toBe(2);
    expect(fingerprintDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });
});

describe('findDuplicate', () => {
  const photos = [
    { id: 'a', fingerprint: 'ff00ff00ff00ff00' },
    { id: 'b', fingerprint: null },
  ];

  it('finds a photo within the margin', () => {
    expect(findDuplicate('ff00ff00ff00ff01', photos)?.id).toBe('a');
  });

  it('ignores a photo just past it', () => {
    expect(findDuplicate('ff00ff00ff00ff1f', photos)).toBeUndefined();
  });

  it('never matches a photo that has no fingerprint yet', () => {
    expect(findDuplicate('0000000000000000', [{ id: 'b', fingerprint: null }])).toBeUndefined();
  });

  it('matches nothing when the upload could not be fingerprinted', () => {
    expect(findDuplicate(null, photos)).toBeUndefined();
  });
});

describe('isFingerprint', () => {
  it('accepts only 16 lowercase hex characters', () => {
    expect(isFingerprint('0123456789abcdef')).toBe(true);
    expect(isFingerprint('0123456789ABCDEF')).toBe(false);
    expect(isFingerprint('0123')).toBe(false);
    expect(isFingerprint(null)).toBe(false);
  });
});

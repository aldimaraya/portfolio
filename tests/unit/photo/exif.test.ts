import { describe, it, expect } from 'vitest';
import {
  formatCamera,
  formatLens,
  formatShutter,
  formatCoordinates,
  orientedDimensions,
  parseOrientation,
} from '@/lib/photo/exif';

describe('formatCamera', () => {
  it('avoids repeating the make when the model already contains it', () => {
    expect(formatCamera('Canon', 'Canon EOS R5')).toBe('Canon EOS R5');
  });

  it('recognises the make even when it carries a corporate suffix', () => {
    expect(formatCamera('NIKON CORPORATION', 'NIKON D750')).toBe('NIKON D750');
  });

  it('joins make and model when the model omits the make', () => {
    expect(formatCamera('FUJIFILM', 'X-T4')).toBe('FUJIFILM X-T4');
  });

  it('trims surrounding whitespace', () => {
    expect(formatCamera('  Canon  ', '  EOS R5 ')).toBe('Canon EOS R5');
  });

  it('falls back to whichever half is present', () => {
    expect(formatCamera(undefined, 'X100V')).toBe('X100V');
    expect(formatCamera('Leica', undefined)).toBe('Leica');
  });

  it('returns undefined when neither is present', () => {
    expect(formatCamera(undefined, undefined)).toBeUndefined();
    expect(formatCamera('', '   ')).toBeUndefined();
  });
});

describe('formatLens', () => {
  it('uses the lens model alone when there is no make', () => {
    expect(formatLens(undefined, 'EF50mm f/1.8 STM')).toBe('EF50mm f/1.8 STM');
  });

  it('joins lens make and model', () => {
    expect(formatLens('Sigma', '35mm F1.4 DG HSM')).toBe('Sigma 35mm F1.4 DG HSM');
  });

  it('does not repeat the lens make', () => {
    expect(formatLens('Sigma', 'Sigma 35mm F1.4')).toBe('Sigma 35mm F1.4');
  });

  it('returns undefined with nothing to show', () => {
    expect(formatLens(undefined, undefined)).toBeUndefined();
  });
});

describe('formatShutter', () => {
  it('renders fast shutter speeds as a fraction', () => {
    expect(formatShutter(0.004)).toBe('1/250');
  });

  it('renders half a second as a fraction', () => {
    expect(formatShutter(0.5)).toBe('1/2');
  });

  it('renders long exposures in seconds', () => {
    expect(formatShutter(1)).toBe('1s');
    expect(formatShutter(30)).toBe('30s');
  });

  it('returns undefined for missing or nonsensical values', () => {
    expect(formatShutter(undefined)).toBeUndefined();
    expect(formatShutter(0)).toBeUndefined();
    expect(formatShutter(Number.NaN)).toBeUndefined();
  });
});

describe('formatCoordinates', () => {
  it('formats a latitude/longitude pair', () => {
    expect(formatCoordinates(35.689487, 139.691711)).toBe('35.68949, 139.69171');
  });

  it('keeps negative coordinates intact', () => {
    expect(formatCoordinates(-33.8688, 151.2093)).toBe('-33.8688, 151.2093');
  });

  it('returns undefined unless both halves are present', () => {
    expect(formatCoordinates(35.6, undefined)).toBeUndefined();
    expect(formatCoordinates(undefined, 139.7)).toBeUndefined();
  });
});

describe('parseOrientation', () => {
  it('accepts a plain numeric orientation', () => {
    expect(parseOrientation(6)).toBe(6);
    expect(parseOrientation(1)).toBe(1);
  });

  it('accepts the human-readable labels exifr produces by default', () => {
    expect(parseOrientation('Rotate 90 CW')).toBe(6);
    expect(parseOrientation('Rotate 270 CW')).toBe(8);
    expect(parseOrientation('Horizontal (normal)')).toBe(1);
    expect(parseOrientation('Rotate 180')).toBe(3);
    expect(parseOrientation('Mirror horizontal and rotate 90 CW')).toBe(7);
  });

  it('is case and whitespace insensitive', () => {
    expect(parseOrientation('  rotate 90 cw  ')).toBe(6);
  });

  it('accepts a numeric string', () => {
    expect(parseOrientation('8')).toBe(8);
  });

  it('treats an unrecognised quarter-turn label as a quarter turn', () => {
    expect(parseOrientation('rotated 90 degrees somehow')).toBe(6);
  });

  it('returns undefined for values it cannot interpret', () => {
    expect(parseOrientation(undefined)).toBeUndefined();
    expect(parseOrientation('nonsense')).toBeUndefined();
    expect(parseOrientation(0)).toBeUndefined();
    expect(parseOrientation(99)).toBeUndefined();
  });

  it('round-trips into a dimension swap', () => {
    const orientation = parseOrientation('Rotate 90 CW');
    expect(orientedDimensions(4000, 3000, orientation)).toEqual({
      width: 3000,
      height: 4000,
    });
  });
});

describe('orientedDimensions', () => {
  it('leaves unrotated images alone', () => {
    expect(orientedDimensions(4000, 3000, 1)).toEqual({ width: 4000, height: 3000 });
  });

  it('leaves a 180 degree rotation alone', () => {
    expect(orientedDimensions(4000, 3000, 3)).toEqual({ width: 4000, height: 3000 });
  });

  it('swaps width and height for every quarter-turn orientation', () => {
    for (const orientation of [5, 6, 7, 8]) {
      expect(orientedDimensions(4000, 3000, orientation)).toEqual({
        width: 3000,
        height: 4000,
      });
    }
  });

  it('assumes no rotation when orientation is absent', () => {
    expect(orientedDimensions(4000, 3000, undefined)).toEqual({ width: 4000, height: 3000 });
  });
});

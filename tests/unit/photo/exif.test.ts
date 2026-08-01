import { describe, it, expect } from 'vitest';
import {
  formatCamera,
  formatLens,
  formatShutter,
  formatCoordinates,
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

  it('drops a phone module, which only restates the camera', () => {
    expect(
      formatLens('Apple', 'iPhone 17 Pro Max back triple camera 16.891mm f/2.8'),
    ).toBeUndefined();
    expect(formatLens('Apple', 'iPhone 12 front camera 2.71mm f/2.2')).toBeUndefined();
  });

  it('keeps a real lens whose name happens to mention a camera mount', () => {
    expect(formatLens('Sigma', '35mm F1.4 DG HSM')).toBe('Sigma 35mm F1.4 DG HSM');
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


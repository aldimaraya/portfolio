import { describe, it, expect, vi, beforeEach } from 'vitest';

const parse = vi.fn();

vi.mock('exifr', () => ({ default: { parse } }));

const { extractPhotoExif } = await import('@/lib/photo/exif');

/**
 * The shape here mirrors what exifr actually returned for a hand-built EXIF JPEG.
 * Orientation is present but deliberately unmapped: dimensions come from decoding
 * the image upright, not from correcting raw pixels by this tag.
 */
const REAL_WORLD_OUTPUT = {
  Make: 'NIKON CORPORATION',
  Model: 'NIKON D750',
  LensModel: '35.0 mm f/1.4',
  DateTimeOriginal: new Date('2026-03-14T13:26:53.000Z'),
  ISO: 400,
  FNumber: 1.4,
  ExposureTime: 0.004,
  FocalLength: 35,
  Orientation: 'Rotate 90 CW',
  latitude: 35.68393333333333,
  longitude: 139.69171111111112,
};

const file = new File([new Uint8Array([0xff, 0xd8])], 'shot.jpg', { type: 'image/jpeg' });

describe('extractPhotoExif', () => {
  // Block body, not `() => parse.mockReset()`: an arrow that returns the mock
  // makes Vitest treat the return value as a teardown callback and invoke it
  // after the test. With the throwing implementation still installed, that
  // phantom teardown call surfaces as an unhandled error and fails the test.
  beforeEach(() => {
    parse.mockReset();
  });

  it('maps a full metadata block onto the app shape', async () => {
    parse.mockResolvedValue(REAL_WORLD_OUTPUT);

    await expect(extractPhotoExif(file)).resolves.toEqual({
      hasExif: true,
      camera: 'NIKON D750',
      lens: '35.0 mm f/1.4',
      capturedAt: REAL_WORLD_OUTPUT.DateTimeOriginal,
      iso: 400,
      aperture: 1.4,
      shutter: '1/250',
      focalLength: 35,
      coordinates: '35.68393, 139.69171',
    });
  });

  it('reports no EXIF when the parser finds nothing', async () => {
    parse.mockResolvedValue(undefined);
    await expect(extractPhotoExif(file)).resolves.toEqual({ hasExif: false });
  });

  it('reports no EXIF rather than throwing when parsing fails', async () => {
    parse.mockImplementation(() => {
      throw new Error('unsupported file');
    });
    await expect(extractPhotoExif(file)).resolves.toEqual({ hasExif: false });
  });

  it('leaves absent fields undefined instead of inventing values', async () => {
    parse.mockResolvedValue({ Make: 'Leica' });

    const result = await extractPhotoExif(file);
    expect(result.hasExif).toBe(true);
    expect(result.camera).toBe('Leica');
    expect(result.lens).toBeUndefined();
    expect(result.coordinates).toBeUndefined();
    expect(result.capturedAt).toBeUndefined();
  });

  it('ignores an invalid capture date', async () => {
    parse.mockResolvedValue({ DateTimeOriginal: new Date('not a date') });
    await expect(extractPhotoExif(file)).resolves.toMatchObject({ capturedAt: undefined });
  });
});

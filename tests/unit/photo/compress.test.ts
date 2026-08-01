import { describe, expect, it } from 'vitest';
import { MAX_EDGE, targetSize, webpFilename } from '@/lib/photo/compress';

describe('targetSize', () => {
  it('leaves an image already within bounds untouched', () => {
    expect(targetSize(1600, 900)).toEqual({ width: 1600, height: 900 });
  });

  it('does not enlarge a small image', () => {
    expect(targetSize(400, 300)).toEqual({ width: 400, height: 300 });
  });

  it('caps the long edge of a landscape photo and keeps the ratio', () => {
    const { width, height } = targetSize(8000, 6000);
    expect(width).toBe(MAX_EDGE);
    expect(height).toBe(1920);
  });

  it('caps the long edge of a portrait photo', () => {
    const { width, height } = targetSize(6000, 8000);
    expect(height).toBe(MAX_EDGE);
    expect(width).toBe(1920);
  });

  it('never rounds an extreme panorama down to zero', () => {
    const { height } = targetSize(20000, 3);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('handles a zero-sized image without dividing by zero', () => {
    expect(targetSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('webpFilename', () => {
  it('swaps the extension', () => {
    expect(webpFilename('DSCF1234.JPG')).toBe('DSCF1234.webp');
  });

  it('only replaces the final extension', () => {
    expect(webpFilename('namsan.blue.hour.jpeg')).toBe('namsan.blue.hour.webp');
  });

  it('appends when there is no extension', () => {
    expect(webpFilename('untitled')).toBe('untitled.webp');
  });

  it('falls back to a name for a dotfile-only input', () => {
    expect(webpFilename('.jpg')).toBe('photo.webp');
  });
});

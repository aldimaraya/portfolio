import { describe, it, expect } from 'vitest';
import { missingRequiredFields, type PhotoDraft } from '@/lib/photo/form';

const complete: PhotoDraft = {
  hasImage: true,
  width: 6240,
  height: 4160,
  location: 'Seoul',
  camera: 'FUJIFILM X100V',
};

describe('missingRequiredFields', () => {
  it('reports nothing for a complete draft', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });

  it('requires an image', () => {
    expect(missingRequiredFields({ ...complete, hasImage: false })).toContain('a photo');
  });

  it('requires a location and a camera', () => {
    expect(missingRequiredFields({ ...complete, location: '' })).toContain('a location');
    expect(missingRequiredFields({ ...complete, camera: '' })).toContain('a camera');
  });

  it('treats a whitespace-only value as missing', () => {
    expect(missingRequiredFields({ ...complete, location: '   ' })).toContain('a location');
    expect(missingRequiredFields({ ...complete, camera: '\t' })).toContain('a camera');
  });

  it('flags unreadable dimensions once an image is present', () => {
    expect(missingRequiredFields({ ...complete, width: 0 })).toContain(
      'readable image dimensions',
    );
    expect(missingRequiredFields({ ...complete, height: 0 })).toContain(
      'readable image dimensions',
    );
  });

  it('does not mention dimensions when there is no image to measure', () => {
    const missing = missingRequiredFields({
      hasImage: false,
      width: 0,
      height: 0,
      location: 'Seoul',
      camera: 'X100V',
    });
    expect(missing).toEqual(['a photo']);
  });

  it('lists every missing field for an empty form', () => {
    expect(
      missingRequiredFields({
        hasImage: false,
        width: 0,
        height: 0,
        location: '',
        camera: '',
      }),
    ).toEqual(['a photo', 'a location', 'a camera']);
  });

  // Settings are prefilled from EXIF and blank on a phone snap — never required.
  it('ignores lens and exposure settings entirely', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });
});

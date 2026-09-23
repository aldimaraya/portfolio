import { describe, it, expect } from 'vitest';
import { photoCaption, type CaptionSource } from '@/lib/photo/caption';
import { EMPTY_SETTINGS } from '@/lib/photo/settings';

const base: CaptionSource = {
  title: '',
  location: 'Tokyo',
  camera: 'Leica M6',
  settings: { ...EMPTY_SETTINGS, aperture: 'f/2' },
  takenAt: null,
};

describe('photoCaption', () => {
  it('reads exactly as before when there is no title', () => {
    expect(photoCaption(base)).toEqual({
      heading: 'Tokyo',
      meta: 'Leica M6 · f/2',
      label: 'Tokyo',
    });
  });

  it('moves the location into the meta line once a title takes the heading', () => {
    expect(photoCaption({ ...base, title: 'Last Ferry' })).toEqual({
      heading: 'Last Ferry',
      meta: 'Tokyo · Leica M6 · f/2',
      label: 'Last Ferry, Tokyo',
    });
  });

  it('treats a whitespace-only title as no title', () => {
    expect(photoCaption({ ...base, title: '   ' }).heading).toBe('Tokyo');
  });

  it('appends the capture date and drops blank parts', () => {
    const caption = photoCaption({
      ...base,
      camera: '',
      settings: EMPTY_SETTINGS,
      takenAt: new Date('2024-03-15T00:00:00Z'),
    });
    expect(caption.meta).toBe('MAR 2024');
  });
});

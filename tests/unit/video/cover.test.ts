import { describe, it, expect } from 'vitest';
import { COVER_PREFIX, isCustomPoster } from '@/lib/video/cover';

describe('isCustomPoster', () => {
  it('recognises a cover by its prefix', () => {
    expect(isCustomPoster(`https://media.idlabs.me/${COVER_PREFIX}/dive-mvsu1kj.jpg`)).toBe(true);
  });

  it('treats a grabbed frame as not custom', () => {
    expect(isCustomPoster('https://media.idlabs.me/posters/dive-poster-mvsu1kj.webp')).toBe(false);
  });

  // The prefix is matched as a path segment, not a substring: a clip named after
  // its covers would otherwise have its grabbed poster mistaken for one.
  it('is not fooled by "covers" elsewhere in the key', () => {
    expect(isCustomPoster('https://media.idlabs.me/posters/covers-poster-x.webp')).toBe(false);
    expect(isCustomPoster('https://media.idlabs.me/posters/a/covers/b.webp')).toBe(false);
  });

  it('is false for nothing stored, or for something that is not a URL', () => {
    expect(isCustomPoster('')).toBe(false);
    expect(isCustomPoster('covers/x.jpg')).toBe(false);
  });
});

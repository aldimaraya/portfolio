import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Shooting Portra in Tokyo')).toBe('shooting-portra-in-tokyo');
  });

  it('strips punctuation', () => {
    expect(slugify('Why I Shoot Film (Still!)')).toBe('why-i-shoot-film-still');
  });

  it('collapses repeated separators', () => {
    expect(slugify('a   ---   b')).toBe('a-b');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('falls back to "post" for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('post');
    expect(slugify('')).toBe('post');
  });

  it('keeps digits', () => {
    expect(slugify('35mm in 2026')).toBe('35mm-in-2026');
  });

  // Non-ASCII titles are plausible here — the site is about travel photography.
  it('drops characters it cannot transliterate rather than emitting empties', () => {
    expect(slugify('Seoul 서울 nights')).toBe('seoul-nights');
    expect(slugify('서울')).toBe('post');
  });
});

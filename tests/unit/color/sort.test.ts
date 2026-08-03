import { describe, it, expect } from 'vitest';
import {
  sortPhotosForWall,
  parseSort,
  parseSeed,
  randomSeed,
  DEFAULT_SORT,
} from '@/lib/color/sort';

const photo = (id: string, warmth: number, avgLightness: number, isMonochrome = false) => ({
  id,
  warmth,
  avgLightness,
  isMonochrome,
});

describe('sortPhotosForWall', () => {
  it('places every monochrome photo before every color photo', () => {
    const result = sortPhotosForWall([photo('color', 0.02, 0.5), photo('mono', 0, 0.5, true)]);
    expect(result.map((p) => p.id)).toEqual(['mono', 'color']);
  });

  it('orders monochrome photos dark to light', () => {
    const result = sortPhotosForWall([
      photo('light', 0, 0.9, true),
      photo('dark', 0, 0.1, true),
      photo('mid', 0, 0.5, true),
    ]);
    expect(result.map((p) => p.id)).toEqual(['dark', 'mid', 'light']);
  });

  it('orders color photos cool to warm', () => {
    const result = sortPhotosForWall([
      photo('golden', 0.06, 0.5),
      photo('night', -0.02, 0.5),
      photo('overcast', 0.01, 0.5),
    ]);
    expect(result.map((p) => p.id)).toEqual(['night', 'overcast', 'golden']);
  });

  it('puts a frame whose colours cancel in the middle, not at either end', () => {
    // The reason warmth replaced hue: this photo has no dominant colour, and
    // mid-scale is both the honest answer and where it looks right.
    const result = sortPhotosForWall([
      photo('golden', 0.06, 0.5),
      photo('cancelled', 0.001, 0.5),
      photo('night', -0.02, 0.5),
    ]);
    expect(result.map((p) => p.id)).toEqual(['night', 'cancelled', 'golden']);
  });

  it('produces a monochrome band followed by a cool-to-warm sweep', () => {
    const result = sortPhotosForWall([
      photo('warm', 0.05, 0.5),
      photo('monoLight', 0, 0.8, true),
      photo('cool', -0.03, 0.5),
      photo('monoDark', 0, 0.2, true),
    ]);
    expect(result.map((p) => p.id)).toEqual(['monoDark', 'monoLight', 'cool', 'warm']);
  });

  it('does not mutate the input array', () => {
    const input = [photo('b', 0.05, 0.5), photo('a', -0.01, 0.5)];
    const snapshot = input.map((p) => p.id);
    sortPhotosForWall(input);
    expect(input.map((p) => p.id)).toEqual(snapshot);
  });

  it('returns an empty array unchanged', () => {
    expect(sortPhotosForWall([])).toEqual([]);
  });
});

const dated = (id: string, takenAt: string | null) => ({
  id,
  warmth: 0,
  avgLightness: 0.5,
  isMonochrome: false,
  takenAt: takenAt ? new Date(takenAt) : null,
});

describe('sortPhotosForWall by date', () => {
  it('orders oldest first', () => {
    const result = sortPhotosForWall(
      [dated('b', '2024-06-01'), dated('a', '2020-01-01'), dated('c', '2025-12-31')],
      'oldest',
    );
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders newest first', () => {
    const result = sortPhotosForWall(
      [dated('b', '2024-06-01'), dated('a', '2020-01-01'), dated('c', '2025-12-31')],
      'newest',
    );
    expect(result.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('sinks undated photos to the end in both directions', () => {
    const input = [dated('none', null), dated('old', '2020-01-01'), dated('new', '2025-01-01')];
    expect(sortPhotosForWall(input, 'newest').map((p) => p.id)).toEqual(['new', 'old', 'none']);
    expect(sortPhotosForWall(input, 'oldest').map((p) => p.id)).toEqual(['old', 'new', 'none']);
  });

  it('keeps undated photos in their incoming order', () => {
    const input = [dated('x', null), dated('y', null), dated('dated', '2020-01-01')];
    expect(sortPhotosForWall(input, 'oldest').map((p) => p.id)).toEqual(['dated', 'x', 'y']);
  });

  it('does not mutate the input array', () => {
    const input = [dated('b', '2025-01-01'), dated('a', '2020-01-01')];
    sortPhotosForWall(input, 'oldest');
    expect(input.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('sortPhotosForWall warm to cool', () => {
  it('reverses the whole wall, greys last', () => {
    const result = sortPhotosForWall(
      [
        photo('warm', 0.05, 0.5),
        photo('monoLight', 0, 0.8, true),
        photo('cool', -0.03, 0.5),
        photo('monoDark', 0, 0.2, true),
      ],
      'cool',
    );
    expect(result.map((p) => p.id)).toEqual(['warm', 'cool', 'monoLight', 'monoDark']);
  });
});

describe('parseSort', () => {
  it('accepts the four known modes', () => {
    for (const mode of ['warm', 'cool', 'newest', 'oldest'] as const) {
      expect(parseSort(mode)).toBe(mode);
    }
  });

  it('falls back to the default for anything else', () => {
    expect(parseSort(null)).toBe(DEFAULT_SORT);
    expect(parseSort('sideways')).toBe(DEFAULT_SORT);
  });
});

describe('sortPhotosForWall random', () => {
  const many = Array.from({ length: 40 }, (_, i) => photo(String(i), i / 100, 0.5));

  it('is a permutation, losing and duplicating nothing', () => {
    const result = sortPhotosForWall(many, 'random', 7);
    expect(result.map((p) => p.id).sort()).toEqual(many.map((p) => p.id).sort());
  });

  it('deals the same wall for the same seed', () => {
    expect(sortPhotosForWall(many, 'random', 7).map((p) => p.id)).toEqual(
      sortPhotosForWall(many, 'random', 7).map((p) => p.id),
    );
  });

  it('deals a different wall for a different seed', () => {
    expect(sortPhotosForWall(many, 'random', 7).map((p) => p.id)).not.toEqual(
      sortPhotosForWall(many, 'random', 8).map((p) => p.id),
    );
  });

  it('actually reorders', () => {
    expect(sortPhotosForWall(many, 'random', 7).map((p) => p.id)).not.toEqual(
      many.map((p) => p.id),
    );
  });

  it('does not mutate the input array', () => {
    const input = [photo('a', 0, 0.5), photo('b', 0.1, 0.5), photo('c', 0.2, 0.5)];
    sortPhotosForWall(input, 'random', 3);
    expect(input.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('parseSeed', () => {
  it('reads an integer seed', () => {
    expect(parseSeed('12345')).toBe(12345);
  });

  it('falls back for junk, empty, and zero', () => {
    expect(parseSeed(null)).toBe(1);
    expect(parseSeed('')).toBe(1);
    expect(parseSeed('abc')).toBe(1);
    expect(parseSeed('0')).toBe(1);
  });
});

describe('randomSeed', () => {
  it('never returns a seed parseSeed would reject', () => {
    for (let i = 0; i < 200; i += 1) {
      const seed = randomSeed();
      expect(parseSeed(String(seed))).toBe(seed);
    }
  });
});

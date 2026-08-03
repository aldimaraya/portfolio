import { describe, it, expect } from 'vitest';
import { sortPhotosForWall } from '@/lib/color/sort';

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

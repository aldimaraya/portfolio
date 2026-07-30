import { describe, it, expect } from 'vitest';
import { sortPhotosForWall } from '@/lib/color/sort';

const photo = (id: string, avgHue: number, avgLightness: number, isMonochrome: boolean) => ({
  id,
  avgHue,
  avgLightness,
  isMonochrome,
});

describe('sortPhotosForWall', () => {
  it('places every monochrome photo before every color photo', () => {
    const result = sortPhotosForWall([
      photo('color', 200, 0.5, false),
      photo('mono', 0, 0.5, true),
    ]);
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

  it('orders color photos by ascending hue', () => {
    const result = sortPhotosForWall([
      photo('blue', 240, 0.5, false),
      photo('red', 5, 0.5, false),
      photo('green', 120, 0.5, false),
    ]);
    expect(result.map((p) => p.id)).toEqual(['red', 'green', 'blue']);
  });

  it('produces a full monochrome band followed by a hue sweep', () => {
    const result = sortPhotosForWall([
      photo('blue', 240, 0.5, false),
      photo('monoLight', 0, 0.8, true),
      photo('red', 10, 0.5, false),
      photo('monoDark', 0, 0.2, true),
    ]);
    expect(result.map((p) => p.id)).toEqual(['monoDark', 'monoLight', 'red', 'blue']);
  });

  it('does not mutate the input array', () => {
    const input = [photo('b', 240, 0.5, false), photo('a', 10, 0.5, false)];
    const snapshot = input.map((p) => p.id);
    sortPhotosForWall(input);
    expect(input.map((p) => p.id)).toEqual(snapshot);
  });

  it('returns an empty array unchanged', () => {
    expect(sortPhotosForWall([])).toEqual([]);
  });
});

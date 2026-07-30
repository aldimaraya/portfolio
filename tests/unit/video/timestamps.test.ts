import { describe, it, expect } from 'vitest';
import { computeFrameTimestamps, DEFAULT_SPRITE_FRAMES } from '@/lib/video/timestamps';

describe('computeFrameTimestamps', () => {
  it('returns the requested number of frames', () => {
    expect(computeFrameTimestamps(20, 10)).toHaveLength(10);
  });

  it('defaults to ten frames', () => {
    expect(computeFrameTimestamps(20)).toHaveLength(DEFAULT_SPRITE_FRAMES);
  });

  it('samples slice midpoints', () => {
    expect(computeFrameTimestamps(20, 10)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  });

  it('never samples the very first or very last instant', () => {
    const result = computeFrameTimestamps(12, 6);
    expect(result[0]).toBeGreaterThan(0);
    expect(result[result.length - 1]).toBeLessThan(12);
  });

  it('returns ascending timestamps', () => {
    const result = computeFrameTimestamps(37.5, 10);
    const sorted = [...result].sort((a, b) => a - b);
    expect(result).toEqual(sorted);
  });

  it('returns an empty array for a zero-length video', () => {
    expect(computeFrameTimestamps(0, 10)).toEqual([]);
  });

  it('returns an empty array for a non-finite duration', () => {
    expect(computeFrameTimestamps(Number.NaN, 10)).toEqual([]);
    expect(computeFrameTimestamps(Number.POSITIVE_INFINITY, 10)).toEqual([]);
  });

  it('returns an empty array when asked for fewer than one frame', () => {
    expect(computeFrameTimestamps(20, 0)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  computeFrameTimestamps,
  DEFAULT_SPRITE_FRAMES,
  PREVIEW_WINDOW_SECONDS,
} from '@/lib/video/timestamps';

describe('computeFrameTimestamps', () => {
  it('returns the requested number of frames', () => {
    expect(computeFrameTimestamps(20, 10)).toHaveLength(10);
  });

  it('defaults to the preview frame count', () => {
    expect(computeFrameTimestamps(20)).toHaveLength(DEFAULT_SPRITE_FRAMES);
  });

  it('samples slice midpoints within the window', () => {
    // 20s clip: window opens at 4s and runs 2s, so slices are 0.5s wide.
    expect(computeFrameTimestamps(20, 4, 2)).toEqual([4.25, 4.75, 5.25, 5.75]);
  });

  it('keeps frames close enough together to read as motion', () => {
    const result = computeFrameTimestamps(30);
    const gap = result[1] - result[0];
    // The old whole-clip sampling put these seconds apart on a long clip.
    expect(gap).toBeLessThan(0.2);
    expect(result[result.length - 1] - result[0]).toBeLessThan(PREVIEW_WINDOW_SECONDS);
  });

  it('skips the opening of the clip', () => {
    expect(computeFrameTimestamps(30, 4, 2)[0]).toBeGreaterThan(1);
  });

  it('never samples the very first or very last instant', () => {
    const result = computeFrameTimestamps(12, 6);
    expect(result[0]).toBeGreaterThan(0);
    expect(result[result.length - 1]).toBeLessThan(12);
  });

  it('samples a clip shorter than the window end to end', () => {
    const result = computeFrameTimestamps(1, 4, 2);
    expect(result).toEqual([0.125, 0.375, 0.625, 0.875]);
  });

  it('keeps the window inside a clip barely longer than it', () => {
    const result = computeFrameTimestamps(2.2, 4, 2);
    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[result.length - 1]).toBeLessThanOrEqual(2.2);
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

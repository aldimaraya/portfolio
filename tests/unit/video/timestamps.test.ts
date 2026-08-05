import { describe, it, expect } from 'vitest';
import {
  computeFrameTimestamps,
  DEFAULT_SPRITE_FRAMES,
  PREVIEW_WINDOW_SECONDS,
  windowSpan,
  windowStart,
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

  it('opens the window where asked instead of at the default fifth', () => {
    // 20s clip, 2s window, 4 frames: slices are 0.5s wide from 12s.
    expect(computeFrameTimestamps(20, 4, 2, 12)).toEqual([12.25, 12.75, 13.25, 13.75]);
  });

  it('accepts a requested start of zero rather than falling back to the default', () => {
    expect(computeFrameTimestamps(20, 4, 2, 0)[0]).toBe(0.25);
  });

  it('pulls a requested window back inside the clip', () => {
    const result = computeFrameTimestamps(20, 4, 2, 19.5);
    expect(result[result.length - 1]).toBeLessThanOrEqual(20);
    expect(result[0]).toBeGreaterThanOrEqual(18);
  });

  it('clamps a negative request to the start of the clip', () => {
    expect(computeFrameTimestamps(20, 4, 2, -5)[0]).toBe(0.25);
  });
});

describe('windowStart', () => {
  it('defaults to a fifth of the way in', () => {
    expect(windowStart(20, 2)).toBe(4);
  });

  it('ignores a non-finite request', () => {
    expect(windowStart(20, 2, Number.NaN)).toBe(4);
  });

  it('never lets the window run past the end', () => {
    expect(windowStart(20, 2, 100)).toBe(18);
  });

  it('has nowhere to go on a clip shorter than the window', () => {
    expect(windowStart(1, 2, 0.5)).toBe(0);
  });
});

describe('windowSpan', () => {
  it('is the window length on a long enough clip', () => {
    expect(windowSpan(20, 2)).toBe(2);
  });

  it('is the whole clip when that is shorter', () => {
    expect(windowSpan(1, 2)).toBe(1);
  });
});

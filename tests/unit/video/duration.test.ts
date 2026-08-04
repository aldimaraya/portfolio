import { describe, expect, it } from 'vitest';
import { formatDuration, rollDuration } from '@/lib/video/duration';

describe('formatDuration', () => {
  it('writes minutes and seconds with a padded remainder', () => {
    expect(formatDuration(72)).toBe('1:12');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('rounds to the nearest second rather than flooring', () => {
    // Flooring would label this 0:59 while the player's timeline says 1:00.
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(59.4)).toBe('0:59');
  });

  // The column default on every clip stored before it existed.
  it('treats an unknown length as unknown, not as zero', () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-3)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('breaks out hours rather than running the minutes past 60', () => {
    expect(formatDuration(3849)).toBe('1:04:09');
    expect(formatDuration(3600)).toBe('1:00:00');
  });
});

describe('rollDuration', () => {
  it('adds up the clips it knows', () => {
    expect(rollDuration([72, 48, 60])).toEqual({ total: '3:00', unknown: 0 });
  });

  // A floor is honest; counting an unknown clip as zero would understate the
  // roll while looking exact.
  it('skips clips of unknown length and reports how many', () => {
    expect(rollDuration([72, 0, 48, 0])).toEqual({ total: '2:00', unknown: 2 });
  });

  it('has no total at all when nothing is known', () => {
    expect(rollDuration([0, 0])).toEqual({ total: null, unknown: 2 });
    expect(rollDuration([])).toEqual({ total: null, unknown: 0 });
  });
});

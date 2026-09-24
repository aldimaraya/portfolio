import { describe, expect, it } from 'vitest';
import { gapAt, isNoop, moveBetween } from '@/lib/video/board';

describe('gapAt', () => {
  // A 60px row starting at y=100.
  it('points above a row from its top half and below it from its bottom half', () => {
    expect(gapAt(2, 110, 100, 60)).toBe(2);
    expect(gapAt(2, 129, 100, 60)).toBe(2);
    expect(gapAt(2, 130, 100, 60)).toBe(3);
    expect(gapAt(2, 159, 100, 60)).toBe(3);
  });
});

describe('moveBetween', () => {
  const groups = [['a', 'b', 'c'], ['x', 'y'], []];

  it('moves down its own list into the gap it was dropped in', () => {
    // Below c.
    expect(moveBetween(groups, { group: 0, index: 0 }, { group: 0, index: 3 })[0]).toEqual([
      'b',
      'c',
      'a',
    ]);
    // Between b and c.
    expect(moveBetween(groups, { group: 0, index: 0 }, { group: 0, index: 2 })[0]).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('moves up its own list into the gap it was dropped in', () => {
    expect(moveBetween(groups, { group: 0, index: 2 }, { group: 0, index: 0 })[0]).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('carries an item into another list at the gap', () => {
    const next = moveBetween(groups, { group: 0, index: 1 }, { group: 1, index: 1 });
    expect(next[0]).toEqual(['a', 'c']);
    expect(next[1]).toEqual(['x', 'b', 'y']);
  });

  // Dropped on the bottom half of a roll's last clip, or in the space below it.
  it('lands below the last row when pointed there', () => {
    expect(moveBetween(groups, { group: 0, index: 0 }, { group: 1, index: 2 })[1]).toEqual([
      'x',
      'y',
      'a',
    ]);
  });

  // The only way into a roll with nothing on it yet.
  it('drops into an empty list', () => {
    expect(moveBetween(groups, { group: 0, index: 0 }, { group: 2, index: 0 })[2]).toEqual(['a']);
  });

  // The caller restores the old lists if the save fails.
  it('leaves its input alone', () => {
    moveBetween(groups, { group: 0, index: 0 }, { group: 1, index: 0 });
    expect(groups).toEqual([['a', 'b', 'c'], ['x', 'y'], []]);
  });
});

describe('isNoop', () => {
  it('is a no-op to drop an item into the gap just above or below itself', () => {
    expect(isNoop({ group: 0, index: 1 }, { group: 0, index: 1 })).toBe(true);
    expect(isNoop({ group: 0, index: 1 }, { group: 0, index: 2 })).toBe(true);
  });

  it('is a move anywhere else', () => {
    expect(isNoop({ group: 0, index: 1 }, { group: 0, index: 0 })).toBe(false);
    expect(isNoop({ group: 0, index: 1 }, { group: 0, index: 3 })).toBe(false);
    expect(isNoop({ group: 0, index: 0 }, { group: 1, index: 0 })).toBe(false);
  });
});

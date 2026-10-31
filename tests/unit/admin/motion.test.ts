import { describe, expect, it } from 'vitest';
import { matchesClip, nudgeTarget } from '@/lib/admin/motion';
import { moveBetween } from '@/lib/video/board';

const clip = { title: 'Blue hour, Namsan', description: 'From the tower', tags: ['city', 'night'] };

describe('matchesClip', () => {
  it('matches everything on an empty query', () => {
    expect(matchesClip(clip, 'Seoul', '  ')).toBe(true);
  });

  it('looks in the title, description, tags and roll name, ignoring case', () => {
    expect(matchesClip(clip, 'Seoul', 'namsan')).toBe(true);
    expect(matchesClip(clip, 'Seoul', 'TOWER')).toBe(true);
    expect(matchesClip(clip, 'Seoul', 'night')).toBe(true);
    expect(matchesClip(clip, 'Seoul', 'seoul')).toBe(true);
  });

  it('needs every word to land somewhere', () => {
    expect(matchesClip(clip, 'Seoul', 'seoul night')).toBe(true);
    expect(matchesClip(clip, 'Seoul', 'seoul day')).toBe(false);
  });
});

describe('nudgeTarget', () => {
  const lengths = [3, 2, 0, 1];
  const writable = [true, true, true, true];

  it('moves one place within a roll, in gap terms', () => {
    expect(nudgeTarget(lengths, writable, { group: 0, index: 1 }, -1)).toEqual({ group: 0, index: 0 });
    expect(nudgeTarget(lengths, writable, { group: 0, index: 1 }, 1)).toEqual({ group: 0, index: 3 });
  });

  it('lands where a single step should once applied', () => {
    const lists = [['a', 'b', 'c']];
    const down = nudgeTarget([3], [true], { group: 0, index: 0 }, 1)!;
    expect(moveBetween(lists, { group: 0, index: 0 }, down)).toEqual([['b', 'a', 'c']]);
    const up = nudgeTarget([3], [true], { group: 0, index: 2 }, -1)!;
    expect(moveBetween(lists, { group: 0, index: 2 }, up)).toEqual([['a', 'c', 'b']]);
  });

  it('crosses to the end of the roll above and the top of the roll below', () => {
    expect(nudgeTarget(lengths, writable, { group: 1, index: 0 }, -1)).toEqual({ group: 0, index: 3 });
    expect(nudgeTarget(lengths, writable, { group: 0, index: 2 }, 1)).toEqual({ group: 1, index: 0 });
  });

  it('lands on an empty roll rather than skipping it', () => {
    expect(nudgeTarget(lengths, writable, { group: 1, index: 1 }, 1)).toEqual({ group: 2, index: 0 });
    expect(nudgeTarget(lengths, writable, { group: 3, index: 0 }, -1)).toEqual({ group: 2, index: 0 });
  });

  it('stops at the ends of the board', () => {
    expect(nudgeTarget(lengths, writable, { group: 0, index: 0 }, -1)).toBeNull();
    expect(nudgeTarget(lengths, writable, { group: 3, index: 0 }, 1)).toBeNull();
  });

  it('never lands on a list without a roll, but can leave one', () => {
    const unfiledFirst = [false, true];
    expect(nudgeTarget([2, 1], unfiledFirst, { group: 1, index: 0 }, -1)).toBeNull();
    expect(nudgeTarget([2, 1], unfiledFirst, { group: 0, index: 0 }, 1)).toEqual({ group: 1, index: 0 });
    expect(nudgeTarget([2, 1], unfiledFirst, { group: 0, index: 1 }, -1)).toBeNull();
  });
});

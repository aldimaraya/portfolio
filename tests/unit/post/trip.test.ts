import { describe, expect, it } from 'vitest';
import {
  autoLayout,
  dayKey,
  formatDayKey,
  groupByCategory,
  groupByDay,
  groupByPlace,
  promptForTag,
  wallClockAsUtc,
  type TrayPhoto,
} from '@/lib/post/trip';

const photo = (id: string, takenAt: string | null, category: string | null = null): TrayPhoto => ({
  id,
  imageUrl: `https://cdn.test/journal/${id}.jpg`,
  thumbUrl: null,
  width: 1500,
  height: 1000,
  takenAt: takenAt ? new Date(takenAt) : null,
  category,
  fingerprint: null,
  place: null,
});

describe('wallClockAsUtc', () => {
  it('keeps the numbers the camera recorded, whatever the zone', () => {
    // 23:30 local on the 14th — still the 14th, even where that is the 15th in UTC.
    const local = new Date(2026, 2, 14, 23, 30, 5);
    const stored = wallClockAsUtc(local);
    expect(stored.toISOString()).toBe('2026-03-14T23:30:05.000Z');
    expect(dayKey(stored)).toBe('2026-03-14');
  });
});

describe('formatDayKey', () => {
  it('reads a day the way the margin writes it', () => {
    expect(formatDayKey('2026-03-14')).toBe('Sat 14 Mar');
    expect(formatDayKey('not-a-day')).toBe('');
  });
});

describe('groupByDay', () => {
  it('orders days and puts undated last', () => {
    const days = groupByDay([
      photo('c', '2026-03-16T09:00:00Z'),
      photo('x', null),
      photo('a', '2026-03-14T20:00:00Z'),
      photo('b', '2026-03-14T08:00:00Z'),
    ]);
    expect(days.map((day) => [day.key, day.photos.map((p) => p.id)])).toEqual([
      ['2026-03-14', ['b', 'a']],
      ['2026-03-16', ['c']],
      [null, ['x']],
    ]);
  });
});

describe('groupByPlace', () => {
  const at = (id: string, takenAt: string | null, place: string | null) => ({ ...photo(id, takenAt), place });

  it('orders places by when the trip first reached them', () => {
    const groups = groupByPlace([
      at('n1', '2025-03-16T10:00:00Z', 'Nara'),
      at('k1', '2025-03-14T10:00:00Z', 'Kyoto'),
      at('o1', '2025-03-15T10:00:00Z', 'Osaka'),
    ]);
    expect(groups.map((group) => group.place)).toEqual(['Kyoto', 'Osaka', 'Nara']);
  });

  it('keeps a place visited twice as one group, in time order', () => {
    const groups = groupByPlace([
      at('k2', '2025-03-17T10:00:00Z', 'Kyoto'),
      at('o1', '2025-03-15T10:00:00Z', 'Osaka'),
      at('k1', '2025-03-14T10:00:00Z', 'Kyoto'),
    ]);
    expect(groups.map((group) => [group.place, group.photos.map((p) => p.id)])).toEqual([
      ['Kyoto', ['k1', 'k2']],
      ['Osaka', ['o1']],
    ]);
  });

  it('puts unplaced photos last', () => {
    const groups = groupByPlace([at('u', '2025-03-13T10:00:00Z', null), at('k', '2025-03-14T10:00:00Z', 'Kyoto')]);
    expect(groups.map((group) => group.place)).toEqual(['Kyoto', null]);
  });

  it('returns nothing for an empty tray', () => {
    expect(groupByPlace([])).toEqual([]);
  });
});

describe('groupByCategory', () => {
  it('follows the category order, untagged last, and drops empty groups', () => {
    const groups = groupByCategory([
      photo('a', null, 'stay'),
      photo('b', null, 'food'),
      photo('c', null, null),
      photo('d', null, 'nonsense'),
    ]);
    expect(groups.map((group) => [group.label, group.photos.map((p) => p.id)])).toEqual([
      ['Food', ['b']],
      ['Stay', ['a']],
      ['Untagged', ['c', 'd']],
    ]);
  });
});

describe('autoLayout', () => {
  it('stacks one, rows up to three, grids the rest', () => {
    expect([1, 2, 3, 4, 9].map(autoLayout)).toEqual(['stacked', 'row', 'row', 'grid', 'grid']);
  });
});

describe('promptForTag', () => {
  it('prompts by category and falls back for untagged', () => {
    expect(promptForTag('Food')).toBe('Write about the food…');
    expect(promptForTag('Untagged')).toBe('Write about the rest of the day…');
    expect(promptForTag(undefined)).toBeNull();
  });
});

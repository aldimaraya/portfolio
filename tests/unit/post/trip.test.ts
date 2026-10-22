import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/post/content';
import {
  autoLayout,
  dayKey,
  formatDayKey,
  groupByCategory,
  groupByDay,
  insertionPointForDays,
  layoutMissingDays,
  promptForTag,
  wallClockAsUtc,
  type TrayPhoto,
} from '@/lib/post/trip';

const photo = (id: string, takenAt: string | null, category: string | null = null): TrayPhoto => ({
  id,
  imageUrl: `https://cdn.test/journal/${id}.jpg`,
  width: 1500,
  height: 1000,
  takenAt: takenAt ? new Date(takenAt) : null,
  category,
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
  it('orders days, numbers them without counting gaps, and puts undated last', () => {
    const days = groupByDay([
      photo('c', '2026-03-16T09:00:00Z'),
      photo('x', null),
      photo('a', '2026-03-14T20:00:00Z'),
      photo('b', '2026-03-14T08:00:00Z'),
    ]);
    expect(days.map((day) => [day.key, day.number, day.photos.map((p) => p.id)])).toEqual([
      ['2026-03-14', 1, ['b', 'a']],
      ['2026-03-16', 2, ['c']],
      [null, null, ['x']],
    ]);
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

describe('layoutMissingDays', () => {
  const tray = [
    photo('a', '2026-03-14T08:00:00Z', 'food'),
    photo('b', '2026-03-14T09:00:00Z', 'food'),
    photo('c', '2026-03-14T10:00:00Z', null),
    photo('d', '2026-03-15T10:00:00Z', 'sights'),
    photo('e', null, 'food'),
  ];

  it('makes a day per dated tray day, with prose and photos per category', () => {
    const laid = layoutMissingDays(tray, []);
    expect(laid.days).toBe(2);
    expect(laid.photos).toBe(4);
    expect(laid.blocks.map((block) => block.type)).toEqual(['section', 'text', 'photos', 'text', 'photos', 'section', 'text', 'photos']);

    const [first, food, foodPhotos, rest] = laid.blocks;
    expect(first).toMatchObject({ type: 'section', numbered: true, tripDate: '2026-03-14', date: 'Sat 14 Mar' });
    expect(food).toMatchObject({ type: 'text', tag: 'Food' });
    expect(foodPhotos).toMatchObject({ type: 'photos', layout: 'row', items: [{ kind: 'journal', id: 'a' }, { kind: 'journal', id: 'b' }] });
    expect(rest).toMatchObject({ type: 'text', tag: 'Untagged' });
  });

  it('skips days the post already has, and undated photos', () => {
    const existing: Block[] = [
      { id: 's', type: 'section', numbered: true, label: '', title: '', date: '', place: '', tripDate: '2026-03-14' },
    ];
    const laid = layoutMissingDays(tray, existing);
    expect(laid.days).toBe(1);
    expect(laid.blocks[0]).toMatchObject({ type: 'section', tripDate: '2026-03-15' });
  });

  it('has nothing to do when every day is laid out', () => {
    expect(layoutMissingDays([photo('e', null)], []).blocks).toEqual([]);
  });
});

describe('insertionPointForDays', () => {
  const section = (id: string, numbered: boolean): Block => ({ id, type: 'section', numbered, label: '', title: '', date: '', place: '' });
  const divider = (id: string): Block => ({ id, type: 'divider' });

  it('goes after the last day and its blocks, before a closing plain section', () => {
    const blocks = [divider('intro'), section('d1', true), divider('x'), section('pack', false), divider('y')];
    expect(insertionPointForDays(blocks)).toBe(3);
  });

  it('goes at the end when there are no days, or nothing follows the last one', () => {
    expect(insertionPointForDays([divider('a'), section('p', false)])).toBe(2);
    expect(insertionPointForDays([section('d1', true), divider('x')])).toBe(2);
  });
});

describe('promptForTag', () => {
  it('prompts by category and falls back for untagged', () => {
    expect(promptForTag('Food')).toBe('Write about the food…');
    expect(promptForTag('Untagged')).toBe('Write about the rest of the day…');
    expect(promptForTag(undefined)).toBeNull();
  });
});

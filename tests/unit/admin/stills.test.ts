import { describe, it, expect } from 'vitest';
import {
  matchesFilter,
  matchesQuery,
  orderStills,
  parseFilter,
  parseOrder,
  selectStills,
  warmthPosition,
  type LibraryPhoto,
} from '@/lib/admin/stills';

const NOW = Date.UTC(2026, 9, 29);
const DAY = 24 * 60 * 60 * 1000;

const photo = (id: string, overrides: Partial<LibraryPhoto> = {}): LibraryPhoto => ({
  id,
  title: '',
  location: 'Seoul',
  camera: 'Sony A7 IV',
  tags: ['street'],
  createdAt: new Date(NOW - 30 * DAY),
  takenAt: new Date(NOW - 60 * DAY),
  warmth: 0,
  avgLightness: 0.5,
  isMonochrome: false,
  ...overrides,
});

describe('parseFilter / parseOrder', () => {
  it('falls back to the defaults for anything unknown', () => {
    expect(parseFilter('nope')).toBe('all');
    expect(parseFilter(null)).toBe('all');
    expect(parseOrder('toString')).toBe('taken');
    expect(parseOrder(undefined)).toBe('taken');
  });

  it('keeps a known value', () => {
    expect(parseFilter('undated')).toBe('undated');
    expect(parseOrder('wall')).toBe('wall');
  });
});

describe('matchesFilter', () => {
  it('finds photos with no capture date', () => {
    expect(matchesFilter(photo('a', { takenAt: null }), 'undated', NOW)).toBe(true);
    expect(matchesFilter(photo('b'), 'undated', NOW)).toBe(false);
  });

  it('finds untagged photos', () => {
    expect(matchesFilter(photo('a', { tags: [] }), 'untagged', NOW)).toBe(true);
    expect(matchesFilter(photo('b'), 'untagged', NOW)).toBe(false);
  });

  it('finds untitled photos, counting whitespace as no title', () => {
    expect(matchesFilter(photo('a'), 'untitled', NOW)).toBe(true);
    expect(matchesFilter(photo('b', { title: '  ' }), 'untitled', NOW)).toBe(true);
    expect(matchesFilter(photo('c', { title: 'Lanterns' }), 'untitled', NOW)).toBe(false);
  });

  it('counts this week by upload, not by capture', () => {
    const fresh = photo('a', { createdAt: new Date(NOW - 2 * DAY), takenAt: new Date(NOW - 400 * DAY) });
    expect(matchesFilter(fresh, 'week', NOW)).toBe(true);
    expect(matchesFilter(photo('b'), 'week', NOW)).toBe(false);
  });
});

describe('matchesQuery', () => {
  it('needs every word, across any field, case-insensitively', () => {
    const p = photo('a', { title: 'Lanterns', location: 'Busan / Gamcheon', tags: ['night'] });
    expect(matchesQuery(p, 'busan NIGHT')).toBe(true);
    expect(matchesQuery(p, 'busan day')).toBe(false);
    expect(matchesQuery(p, 'sony')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery(photo('a'), '   ')).toBe(true);
  });
});

describe('orderStills', () => {
  const photos = [
    photo('warm', { warmth: 0.05, createdAt: new Date(NOW - 3 * DAY), takenAt: null }),
    photo('mono', { isMonochrome: true, createdAt: new Date(NOW - 1 * DAY), takenAt: new Date(NOW - 10 * DAY) }),
    photo('cool', { warmth: -0.05, createdAt: new Date(NOW - 2 * DAY), takenAt: new Date(NOW - 5 * DAY) }),
  ];

  it('uses the public wall order: monochrome band, then cool to warm', () => {
    expect(orderStills(photos, 'wall').map((p) => p.id)).toEqual(['mono', 'cool', 'warm']);
  });

  it('orders by upload, newest first', () => {
    expect(orderStills(photos, 'added').map((p) => p.id)).toEqual(['mono', 'cool', 'warm']);
  });

  it('orders by capture date, undated last', () => {
    expect(orderStills(photos, 'taken').map((p) => p.id)).toEqual(['cool', 'mono', 'warm']);
  });

  it('never reorders its input', () => {
    const input = [...photos];
    orderStills(input, 'added');
    expect(input.map((p) => p.id)).toEqual(['warm', 'mono', 'cool']);
  });
});

describe('selectStills', () => {
  it('filters, searches and orders together', () => {
    const photos = [
      photo('a', { takenAt: null, location: 'Tokyo', warmth: 0.1 }),
      photo('b', { takenAt: null, location: 'Seoul', warmth: 0.2 }),
      photo('c', { takenAt: null, location: 'Seoul', warmth: -0.1 }),
      photo('d', { location: 'Seoul' }),
    ];
    const result = selectStills(photos, { filter: 'undated', order: 'wall', query: 'seoul', now: NOW });
    expect(result.map((p) => p.id)).toEqual(['c', 'b']);
  });
});

describe('warmthPosition', () => {
  const library = [
    photo('cool', { warmth: -0.1 }),
    photo('mid', { warmth: 0 }),
    photo('warm', { warmth: 0.1 }),
    photo('mono', { isMonochrome: true, warmth: 5 }),
  ];

  it('scales to the colour photos’ own range, ignoring the monochrome band', () => {
    expect(warmthPosition(library[0], library)).toBe(0);
    expect(warmthPosition(library[1], library)).toBeCloseTo(0.5);
    expect(warmthPosition(library[2], library)).toBe(1);
  });

  it('has no position for a monochrome photo', () => {
    expect(warmthPosition(library[3], library)).toBeNull();
  });

  it('centres a library with only one warmth in it', () => {
    expect(warmthPosition(library[1], [library[1]])).toBe(0.5);
  });
});

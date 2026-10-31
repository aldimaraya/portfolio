import { describe, expect, it } from 'vitest';
import {
  change,
  daySeries,
  engagementHref,
  likeRate,
  markedDays,
  parseEngagementQuery,
  windowStart,
} from '@/lib/admin/engagement';

describe('parseEngagementQuery', () => {
  it('defaults to thirty days of everything, ranked by likes', () => {
    expect(parseEngagementQuery({})).toEqual({ days: 30, surface: 'all', sort: 'likes' });
  });

  it('reads a full query', () => {
    expect(parseEngagementQuery({ days: '7', surface: 'motion', sort: 'views' })).toEqual({
      days: 7,
      surface: 'motion',
      sort: 'views',
    });
  });

  it('falls back on anything it does not recognise', () => {
    expect(parseEngagementQuery({ days: '365', surface: 'posts', sort: 'shares' })).toEqual({
      days: 30,
      surface: 'all',
      sort: 'likes',
    });
  });

  it('takes the first of a repeated parameter', () => {
    expect(parseEngagementQuery({ days: ['90', '7'] }).days).toBe(90);
  });
});

describe('engagementHref', () => {
  it('leaves defaults out, so the plain view is the plain URL', () => {
    expect(engagementHref({ days: 30, surface: 'all', sort: 'likes' })).toBe('/admin/engagement');
  });

  it('round-trips through the parser', () => {
    const query = { days: 90, surface: 'journal', sort: 'views' } as const;
    const search = new URLSearchParams(engagementHref(query).split('?')[1]);
    expect(parseEngagementQuery(Object.fromEntries(search))).toEqual(query);
  });
});

describe('windowStart', () => {
  it('is midnight UTC days − 1 back, so the range includes today', () => {
    expect(windowStart(new Date('2026-10-29T23:30:00Z'), 7).toISOString()).toBe('2026-10-23T00:00:00.000Z');
    expect(windowStart(new Date('2026-10-29T00:10:00Z'), 30).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('is today alone for a one-day range', () => {
    expect(windowStart(new Date('2026-10-29T12:00:00Z'), 1).toISOString()).toBe('2026-10-29T00:00:00.000Z');
  });
});

describe('daySeries', () => {
  const start = new Date('2026-10-01T00:00:00Z');

  it('places rows by day and zero-fills the rest', () => {
    const rows = [
      { day: new Date('2026-10-03T00:00:00Z'), visitors: 5 },
      { day: new Date('2026-10-01T00:00:00Z'), visitors: 2 },
    ];
    expect(daySeries(rows, start, 4)).toEqual([2, 0, 5, 0]);
  });

  it('drops rows outside the range', () => {
    const rows = [
      { day: new Date('2026-09-30T00:00:00Z'), visitors: 5 },
      { day: new Date('2026-10-05T00:00:00Z'), visitors: 5 },
    ];
    expect(daySeries(rows, start, 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('markedDays', () => {
  it('flags the day a send started, whatever the hour', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const sends = [new Date('2026-10-02T23:59:00Z'), new Date('2026-09-20T08:00:00Z')];
    expect(markedDays(sends, start, 3)).toEqual([false, true, false]);
  });
});

describe('change', () => {
  it('signs a rise and a fall, with a real minus', () => {
    expect(change(112, 100)).toBe('+12%');
    expect(change(97, 100)).toBe('−3%');
    expect(change(100, 100)).toBe('0%');
  });

  it('says nothing when there was nothing before', () => {
    expect(change(14, 0)).toBeNull();
    expect(change(0, 0)).toBeNull();
  });
});

describe('likeRate', () => {
  it('is likes per hundred views, to one decimal', () => {
    expect(likeRate(33, 612)).toBe('5.4%');
    expect(likeRate(0, 10)).toBe('0%');
  });

  it('is null without views', () => {
    expect(likeRate(41, null)).toBeNull();
    expect(likeRate(3, 0)).toBeNull();
  });
});

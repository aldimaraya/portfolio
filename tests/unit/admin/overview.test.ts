import { describe, expect, it } from 'vitest';
import { batchSummary, countOf, dailySeries, kindCount, weekStartDay } from '@/lib/admin/overview';

describe('countOf', () => {
  it('uses the singular only for exactly one', () => {
    expect(countOf(1, ['clip', 'clips'])).toBe('1 clip');
    expect(countOf(0, ['clip', 'clips'])).toBe('0 clips');
    expect(countOf(6, ['still has', 'stills have'])).toBe('6 stills have');
  });
});

describe('kindCount', () => {
  it('counts things, not surfaces', () => {
    expect(kindCount('motion', 2)).toBe('2 clips');
    expect(kindCount('journal', 1)).toBe('1 post');
  });
});

describe('batchSummary', () => {
  it('lists stills, clips, then posts, leaving out empty kinds', () => {
    const items = [
      { kind: 'journal' as const },
      { kind: 'stills' as const },
      { kind: 'stills' as const },
      { kind: 'motion' as const },
    ];
    expect(batchSummary(items)).toBe('2 stills · 1 clip · 1 post');
    expect(batchSummary([{ kind: 'journal' }])).toBe('1 post');
    expect(batchSummary([])).toBe('');
  });
});

describe('weekStartDay', () => {
  it('is midnight UTC six days back, so the week includes today', () => {
    expect(weekStartDay(new Date('2026-10-29T23:30:00Z')).toISOString()).toBe('2026-10-23T00:00:00.000Z');
  });

  it('crosses a month boundary', () => {
    expect(weekStartDay(new Date('2026-11-02T01:00:00Z')).toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });
});

describe('dailySeries', () => {
  const now = new Date('2026-10-29T15:00:00Z');

  it('runs oldest to today, with zeros for days nobody came', () => {
    const rows = [
      { day: new Date('2026-10-23T00:00:00Z'), visitors: 4 },
      { day: new Date('2026-10-29T00:00:00Z'), visitors: 9 },
      { day: new Date('2026-10-26T00:00:00Z'), visitors: 2 },
    ];
    expect(dailySeries(rows, now)).toEqual([4, 0, 0, 2, 0, 0, 9]);
  });

  it('drops days outside the window', () => {
    const rows = [
      { day: new Date('2026-10-22T00:00:00Z'), visitors: 5 },
      { day: new Date('2026-10-30T00:00:00Z'), visitors: 5 },
    ];
    expect(dailySeries(rows, now)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('is all zeros with no rows', () => {
    expect(dailySeries([], now)).toHaveLength(7);
  });
});

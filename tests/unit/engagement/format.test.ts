import { describe, it, expect } from 'vitest';
import { formatCount, formatViews } from '@/lib/engagement/format';

describe('formatCount', () => {
  it('prints nothing for zero, or for nonsense', () => {
    expect(formatCount(0)).toBe('');
    expect(formatCount(-3)).toBe('');
    expect(formatCount(Number.NaN)).toBe('');
  });

  it('prints small counts as they are', () => {
    expect(formatCount(1)).toBe('1');
    expect(formatCount(999)).toBe('999');
  });

  it('compacts thousands and millions', () => {
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(1250)).toBe('1.2k');
    expect(formatCount(34_567)).toBe('34k');
    expect(formatCount(1_500_000)).toBe('1.5m');
  });

  it('rounds down, never up', () => {
    expect(formatCount(1999)).toBe('1.9k');
    expect(formatCount(999_999)).toBe('999k');
  });
});

describe('formatViews', () => {
  it('names the unit, singular and plural', () => {
    expect(formatViews(1)).toBe('1 view');
    expect(formatViews(2)).toBe('2 views');
    expect(formatViews(1250)).toBe('1.2k views');
  });

  it('prints zero rather than nothing, so the counter never looks missing', () => {
    expect(formatViews(0)).toBe('0 views');
    expect(formatViews(Number.NaN)).toBe('0 views');
  });
});

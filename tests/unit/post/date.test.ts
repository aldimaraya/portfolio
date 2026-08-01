import { describe, it, expect } from 'vitest';
import { formatPostDate } from '@/lib/post/date';

describe('formatPostDate', () => {
  it('writes the date as day, short month, year', () => {
    expect(formatPostDate(new Date('2026-03-09T12:00:00Z'))).toBe('9 Mar 2026');
  });

  it('does not pad the day', () => {
    expect(formatPostDate(new Date('2026-11-01T12:00:00Z'))).toBe('1 Nov 2026');
  });

  it('reads the date in UTC rather than the host zone', () => {
    // Late-evening UTC is already the next day east of Greenwich and still the
    // previous one to the west; the published date must not depend on which
    // machine rendered the page.
    expect(formatPostDate(new Date('2026-03-09T23:30:00Z'))).toBe('9 Mar 2026');
    expect(formatPostDate(new Date('2026-03-09T00:30:00Z'))).toBe('9 Mar 2026');
  });
});

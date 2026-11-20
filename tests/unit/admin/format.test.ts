import { describe, expect, it } from 'vitest';
import { countOf } from '@/lib/admin/format';

describe('countOf', () => {
  it('uses the singular only for exactly one', () => {
    expect(countOf(1, ['clip', 'clips'])).toBe('1 clip');
    expect(countOf(0, ['clip', 'clips'])).toBe('0 clips');
    expect(countOf(6, ['still has', 'stills have'])).toBe('6 stills have');
  });
});

import { describe, it, expect } from 'vitest';
import { formatTagNames, parseTagNames } from '@/lib/tags';

describe('parseTagNames', () => {
  it('splits on commas', () => {
    expect(parseTagNames('street, night')).toEqual(['street', 'night']);
  });

  it('lowercases and trims', () => {
    expect(parseTagNames('  Street ,  NIGHT ')).toEqual(['street', 'night']);
  });

  it('removes duplicates', () => {
    expect(parseTagNames('street, Street, STREET')).toEqual(['street']);
  });

  it('drops empty entries', () => {
    expect(parseTagNames('street,,  ,night')).toEqual(['street', 'night']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseTagNames('')).toEqual([]);
    expect(parseTagNames('   ')).toEqual([]);
  });
});

describe('formatTagNames', () => {
  it('round-trips through parseTagNames', () => {
    // The admin tag pills lean on this: whatever the editor emits has to parse
    // back to the same list the pills showed.
    expect(formatTagNames(parseTagNames('A, b , a'))).toBe('a, b');
    expect(parseTagNames(formatTagNames(['street', 'night']))).toEqual(['street', 'night']);
  });

  it('formats an empty list as an empty string', () => {
    expect(formatTagNames([])).toBe('');
  });
});

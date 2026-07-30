import { describe, it, expect } from 'vitest';
import { parseTagNames } from '@/lib/tags';

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

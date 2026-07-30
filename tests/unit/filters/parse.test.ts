import { describe, it, expect } from 'vitest';
import { parseFilters, serializeFilters, filtersFromSearchParams } from '@/lib/filters/parse';

describe('parseFilters', () => {
  it('returns empty arrays with no query', () => {
    expect(parseFilters(new URLSearchParams())).toEqual({
      cameras: [],
      locations: [],
      tags: [],
    });
  });

  it('splits comma-separated values', () => {
    const result = parseFilters(new URLSearchParams('camera=Leica M6,Contax T2'));
    expect(result.cameras).toEqual(['Leica M6', 'Contax T2']);
  });

  it('reads all three filter types', () => {
    const result = parseFilters(
      new URLSearchParams('camera=Leica&location=Tokyo&tag=street,night'),
    );
    expect(result).toEqual({
      cameras: ['Leica'],
      locations: ['Tokyo'],
      tags: ['street', 'night'],
    });
  });

  it('drops empty and whitespace-only entries', () => {
    expect(parseFilters(new URLSearchParams('camera=Leica,,  ,Contax')).cameras).toEqual([
      'Leica',
      'Contax',
    ]);
  });

  it('de-duplicates repeated values', () => {
    expect(parseFilters(new URLSearchParams('tag=street,street')).tags).toEqual(['street']);
  });
});

describe('serializeFilters', () => {
  it('omits empty filter types', () => {
    const params = serializeFilters({ cameras: [], locations: ['Tokyo'], tags: [] });
    expect(params.toString()).toBe('location=Tokyo');
  });

  it('round-trips through parseFilters', () => {
    const original = { cameras: ['Leica M6'], locations: ['Tokyo'], tags: ['street', 'night'] };
    expect(parseFilters(serializeFilters(original))).toEqual(original);
  });
});

describe('filtersFromSearchParams', () => {
  it('returns empty filters for an empty object', () => {
    expect(filtersFromSearchParams({})).toEqual({ cameras: [], locations: [], tags: [] });
  });

  it('reads string values', () => {
    expect(filtersFromSearchParams({ camera: 'Leica,Contax' }).cameras).toEqual([
      'Leica',
      'Contax',
    ]);
  });

  it('joins repeated array values', () => {
    expect(filtersFromSearchParams({ tag: ['street', 'night'] }).tags).toEqual([
      'street',
      'night',
    ]);
  });

  it('ignores undefined values', () => {
    expect(filtersFromSearchParams({ camera: undefined }).cameras).toEqual([]);
  });
});

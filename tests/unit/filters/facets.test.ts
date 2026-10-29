import { describe, expect, it } from 'vitest';
import { optionsFromPhotos, type FilterablePhoto } from '@/lib/filters/apply';
import { facetCounts, facetTotals, listFacet, matchesQuery } from '@/lib/filters/facets';
import { EMPTY_FILTERS, type MediaFilters } from '@/lib/filters/parse';

const photos: FilterablePhoto[] = [
  { camera: 'Leica M6', location: 'Tokyo', tags: ['street', 'night'] },
  { camera: 'Contax T2', location: 'Tokyo', tags: ['street'] },
  { camera: 'Leica M6', location: 'Lisbon', tags: ['portrait'] },
  { camera: 'Mamiya 7', location: 'Oslo', tags: [] },
  { camera: 'Leica M6', location: 'Tokyo', tags: ['night', 'night'] },
];

function counts(filters: Partial<MediaFilters>) {
  return facetCounts(photos, { ...EMPTY_FILTERS, ...filters });
}

describe('facetCounts', () => {
  it('counts the whole library when nothing is selected', () => {
    const result = counts({});
    expect(result.locations.get('Tokyo')).toBe(3);
    expect(result.cameras.get('Leica M6')).toBe(3);
    expect(result.tags.get('street')).toBe(2);
  });

  it('counts a tag repeated on one photo once', () => {
    expect(counts({}).tags.get('night')).toBe(2);
  });

  it('ignores a facet’s own selection, so siblings show what they would add', () => {
    const result = counts({ locations: ['Tokyo'] });
    expect(result.locations.get('Lisbon')).toBe(1);
    expect(result.locations.get('Tokyo')).toBe(3);
  });

  it('applies the other facets’ selections', () => {
    const result = counts({ cameras: ['Mamiya 7'] });
    expect(result.locations.get('Oslo')).toBe(1);
    expect(result.locations.get('Tokyo')).toBeUndefined();
    // The camera facet itself is still counted against the whole library.
    expect(result.cameras.get('Leica M6')).toBe(3);
  });

  it('ANDs two other facets together', () => {
    const result = counts({ cameras: ['Leica M6'], tags: ['night'] });
    expect(result.locations.get('Tokyo')).toBe(2);
    expect(result.locations.get('Lisbon')).toBeUndefined();
  });
});

describe('matchesQuery', () => {
  it('matches everything on an empty or blank query', () => {
    expect(matchesQuery('Granada', '')).toBe(true);
    expect(matchesQuery('Granada', '   ')).toBe(true);
  });

  it('matches a substring regardless of case', () => {
    expect(matchesQuery('Grand Tetons', 'TET')).toBe(true);
    expect(matchesQuery('Granada', 'lis')).toBe(false);
  });

  it('ignores accents on either side', () => {
    expect(matchesQuery('São Paulo', 'sao')).toBe(true);
    expect(matchesQuery('Zurich', 'Zür')).toBe(true);
  });
});

describe('listFacet', () => {
  const options = optionsFromPhotos(photos);
  const totals = facetTotals(photos);

  it('keeps the alphabetical order by default', () => {
    expect(listFacet(options, 'locations', totals, 'alpha', '')).toEqual([
      'Lisbon',
      'Oslo',
      'Tokyo',
    ]);
  });

  it('orders by library-wide count, ties alphabetical', () => {
    expect(listFacet(options, 'locations', totals, 'count', '')).toEqual([
      'Tokyo',
      'Lisbon',
      'Oslo',
    ]);
  });

  it('narrows by the search query', () => {
    expect(listFacet(options, 'locations', totals, 'alpha', 'o')).toEqual([
      'Lisbon',
      'Oslo',
      'Tokyo',
    ]);
    expect(listFacet(options, 'locations', totals, 'alpha', 'tok')).toEqual(['Tokyo']);
  });
});

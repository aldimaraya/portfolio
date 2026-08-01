import { describe, expect, it } from 'vitest';
import { filterPhotos, optionsFromPhotos, type FilterablePhoto } from '@/lib/filters/apply';
import { EMPTY_FILTERS, type MediaFilters } from '@/lib/filters/parse';

const photos: (FilterablePhoto & { id: string })[] = [
  { id: 'a', camera: 'Leica M6', location: 'Tokyo', tags: ['street', 'night'] },
  { id: 'b', camera: 'Contax T2', location: 'Tokyo', tags: ['street'] },
  { id: 'c', camera: 'Leica M6', location: 'Lisbon', tags: ['portrait'] },
  { id: 'd', camera: 'Mamiya 7', location: 'Oslo', tags: [] },
];

function ids(filters: Partial<MediaFilters>): string[] {
  return filterPhotos(photos, { ...EMPTY_FILTERS, ...filters }).map((photo) => photo.id);
}

describe('filterPhotos', () => {
  it('returns everything when nothing is selected', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ORs within a filter type', () => {
    expect(ids({ cameras: ['Leica M6', 'Contax T2'] })).toEqual(['a', 'b', 'c']);
  });

  it('ANDs across filter types', () => {
    expect(ids({ cameras: ['Leica M6'], locations: ['Tokyo'] })).toEqual(['a']);
  });

  it('matches a photo carrying any one of the selected tags', () => {
    expect(ids({ tags: ['night', 'portrait'] })).toEqual(['a', 'c']);
  });

  it('excludes an untagged photo once a tag is selected', () => {
    expect(ids({ tags: ['street'] })).toEqual(['a', 'b']);
  });

  it('returns nothing when the combination matches nothing', () => {
    expect(ids({ cameras: ['Mamiya 7'], locations: ['Tokyo'] })).toEqual([]);
  });

  it('leaves the input array untouched', () => {
    const before = photos.map((photo) => photo.id);
    filterPhotos(photos, { ...EMPTY_FILTERS, cameras: ['Leica M6'] });
    expect(photos.map((photo) => photo.id)).toEqual(before);
  });
});

describe('optionsFromPhotos', () => {
  it('collects each facet once, sorted', () => {
    expect(optionsFromPhotos(photos)).toEqual({
      cameras: ['Contax T2', 'Leica M6', 'Mamiya 7'],
      locations: ['Lisbon', 'Oslo', 'Tokyo'],
      tags: ['night', 'portrait', 'street'],
    });
  });

  it('drops blanks rather than offering an empty chip', () => {
    expect(optionsFromPhotos([{ camera: '', location: 'Oslo', tags: [] }]).cameras).toEqual(
      [],
    );
  });

  it('has nothing to offer for an empty library', () => {
    expect(optionsFromPhotos([])).toEqual({ cameras: [], locations: [], tags: [] });
  });
});

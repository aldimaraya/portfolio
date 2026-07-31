import { describe, it, expect } from 'vitest';
import { buildPhotoWhere } from '@/lib/filters/where';

describe('buildPhotoWhere', () => {
  it('returns an empty clause with no filters', () => {
    expect(buildPhotoWhere({ cameras: [], locations: [], tags: [] })).toEqual({});
  });

  it('uses OR semantics within one filter type', () => {
    expect(buildPhotoWhere({ cameras: ['Leica', 'Contax'], locations: [], tags: [] })).toEqual({
      AND: [{ camera: { in: ['Leica', 'Contax'] } }],
    });
  });

  it('uses AND semantics across filter types', () => {
    const result = buildPhotoWhere({ cameras: ['Leica'], locations: ['Tokyo'], tags: [] });
    expect(result).toEqual({
      AND: [{ camera: { in: ['Leica'] } }, { location: { in: ['Tokyo'] } }],
    });
  });

  it('matches photos carrying any of the requested tags', () => {
    const result = buildPhotoWhere({ cameras: [], locations: [], tags: ['street', 'night'] });
    expect(result).toEqual({
      AND: [{ tags: { some: { tag: { name: { in: ['street', 'night'] } } } } }],
    });
  });
});

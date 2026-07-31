import { describe, it, expect } from 'vitest';
import { buildPhotoWhere, buildVideoWhere } from '@/lib/filters/where';

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

describe('buildVideoWhere', () => {
  it('returns an empty clause with no filters', () => {
    expect(buildVideoWhere({ cameras: [], locations: [], tags: [] })).toEqual({});
  });

  it('ignores location and camera, which videos do not carry', () => {
    expect(buildVideoWhere({ cameras: ['RED'], locations: ['Tokyo'], tags: [] })).toEqual({});
  });

  it('filters on tags alone', () => {
    expect(buildVideoWhere({ cameras: [], locations: [], tags: ['reel'] })).toEqual({
      AND: [{ tags: { some: { tag: { name: { in: ['reel'] } } } } }],
    });
  });

  // A camera in the URL narrows the stills wall; it must not empty the motion
  // page as a side effect, since both pages share one filter bar.
  it('still matches tag-filtered videos when a camera is also in the URL', () => {
    expect(
      buildVideoWhere({ cameras: ['RED'], locations: [], tags: ['reel'] }),
    ).toEqual({
      AND: [{ tags: { some: { tag: { name: { in: ['reel'] } } } } }],
    });
  });
});

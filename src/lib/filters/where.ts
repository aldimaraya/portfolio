import type { Prisma } from '@prisma/client';
import type { MediaFilters } from './parse';

/**
 * OR within a filter type (two cameras means either camera), AND across types
 * (a camera and a tag means both must match).
 */
export function buildPhotoWhere(filters: MediaFilters): Prisma.PhotoWhereInput {
  const clauses: Prisma.PhotoWhereInput[] = [];

  if (filters.cameras.length) clauses.push({ camera: { in: filters.cameras } });
  if (filters.locations.length) clauses.push({ location: { in: filters.locations } });
  if (filters.tags.length) {
    clauses.push({ tags: { some: { tag: { name: { in: filters.tags } } } } });
  }

  return clauses.length ? { AND: clauses } : {};
}

// No buildVideoWhere: filtering is stills-only. Videos carry neither a camera nor
// a location, and the motion page has no filter bar, so there is nothing for a
// video where-clause to narrow.

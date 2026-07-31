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

/**
 * Videos carry neither a location nor a camera, so only the tag filter applies.
 * The other two are intentionally ignored rather than rejected: the filter bar is
 * shared with the stills page, and a camera in the URL should narrow the wall
 * without emptying the motion page.
 */
export function buildVideoWhere(filters: MediaFilters): Prisma.VideoWhereInput {
  const clauses: Prisma.VideoWhereInput[] = [];

  if (filters.tags.length) {
    clauses.push({ tags: { some: { tag: { name: { in: filters.tags } } } } });
  }

  return clauses.length ? { AND: clauses } : {};
}

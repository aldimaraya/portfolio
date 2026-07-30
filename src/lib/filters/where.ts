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

/** Videos carry no location, so that filter is intentionally ignored here. */
export function buildVideoWhere(filters: MediaFilters): Prisma.VideoWhereInput {
  const clauses: Prisma.VideoWhereInput[] = [];

  if (filters.cameras.length) clauses.push({ camera: { in: filters.cameras } });
  if (filters.tags.length) {
    clauses.push({ tags: { some: { tag: { name: { in: filters.tags } } } } });
  }

  return clauses.length ? { AND: clauses } : {};
}

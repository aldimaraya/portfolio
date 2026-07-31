import { db } from '@/lib/db';

/**
 * The facet values actually present in the library, so the filter bar can only
 * ever offer a chip that matches something.
 *
 * Stills only. Videos carry no camera or location, and the motion page has no
 * filter bar, so there is deliberately no video counterpart here.
 */
export interface FilterOptions {
  cameras: string[];
  locations: string[];
  tags: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function getPhotoFilterOptions(): Promise<FilterOptions> {
  const [photos, tags] = await Promise.all([
    db.photo.findMany({ select: { camera: true, location: true } }),
    // Only tags that are actually on a photo — the tag table is shared with
    // videos, and offering a video-only tag here would filter to nothing.
    db.tag.findMany({ where: { photos: { some: {} } }, select: { name: true } }),
  ]);

  return {
    cameras: unique(photos.map((photo) => photo.camera)),
    locations: unique(photos.map((photo) => photo.location)),
    tags: unique(tags.map((tag) => tag.name)),
  };
}

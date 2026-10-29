import { db } from '@/lib/db';

/**
 * Locations are free text on the row rather than a table of their own, so the
 * admin form's suggestions are the distinct values already in use. Same idea as
 * `listTagNames`, one level less formal — there is nothing to upsert.
 */
export async function listPhotoLocations(): Promise<string[]> {
  const rows = await db.photo.findMany({
    distinct: ['location'],
    select: { location: true },
    orderBy: { location: 'asc' },
  });
  return rows.map((row) => row.location).filter((location) => location.length > 0);
}

/** The same for cameras, for the Add media queue's bulk bar. */
export async function listPhotoCameras(): Promise<string[]> {
  const rows = await db.photo.findMany({
    distinct: ['camera'],
    select: { camera: true },
    orderBy: { camera: 'asc' },
  });
  return rows.map((row) => row.camera).filter((camera) => camera.length > 0);
}

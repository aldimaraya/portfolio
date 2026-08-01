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

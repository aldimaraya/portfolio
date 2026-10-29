import { db } from '@/lib/db';
import { listPhotoCameras, listPhotoLocations } from '@/lib/photo/facets';
import { loadDrafts } from '@/lib/admin/load-drafts';
import { listTagNames } from '@/lib/tags';
import { AddMedia } from '@/components/admin/add/AddMedia';

export const dynamic = 'force-dynamic';

/**
 * Where "Add media" lands. The queue itself lives in the admin layout, so it
 * outlives this page; what the page brings is the drafts already stored —
 * which is how a batch survives a refresh — and the options its fields offer.
 */
export default async function AddMediaPage() {
  const [drafts, rolls, locationOptions, cameraOptions, tagOptions] = await Promise.all([
    loadDrafts(),
    db.roll.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true } }),
    listPhotoLocations(),
    listPhotoCameras(),
    listTagNames(),
  ]);

  return (
    <AddMedia
      drafts={drafts}
      rolls={rolls}
      locationOptions={locationOptions}
      cameraOptions={cameraOptions}
      tagOptions={tagOptions}
    />
  );
}

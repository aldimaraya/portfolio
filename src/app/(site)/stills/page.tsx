import { db } from '@/lib/db';
import { sortPhotosForWall } from '@/lib/color/sort';
import { filtersFromSearchParams } from '@/lib/filters/parse';
import { buildPhotoWhere } from '@/lib/filters/where';
import { getPhotoFilterOptions } from '@/lib/filters/options';
import { FilterBar } from '@/components/site/FilterBar';
import { PolaroidWall } from '@/components/stills/PolaroidWall';
import { toSettings } from '@/lib/photo/settings';

export const dynamic = 'force-dynamic';

export default async function StillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = filtersFromSearchParams(await searchParams);

  const [photos, options] = await Promise.all([
    db.photo.findMany({ where: buildPhotoWhere(filters) }),
    // Unfiltered on purpose: the chips must stay put as you narrow, or the
    // control you just clicked disappears from under you.
    getPhotoFilterOptions(),
  ]);

  return (
    <main>
      <FilterBar options={options} active={filters} />
      <PolaroidWall
        photos={sortPhotosForWall(photos).map((photo) => ({
          id: photo.id,
          imageUrl: photo.imageUrl,
          width: photo.width,
          height: photo.height,
          location: photo.location,
          camera: photo.camera,
          // The Json column is untyped at the DB boundary — coerce it here.
          settings: toSettings(photo.settings),
        }))}
      />
    </main>
  );
}

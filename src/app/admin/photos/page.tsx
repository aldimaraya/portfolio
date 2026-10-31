import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { listPhotoLocations } from '@/lib/photo/facets';
import { parseFilter, parseOrder } from '@/lib/admin/stills';
import { safeNextPath } from '@/lib/auth/next-path';
import { OPEN_PHOTO_PARAM, RETURN_PARAM } from '@/lib/photo/lightbox-link';
import { toSettings } from '@/lib/photo/settings';
import { StillsLibrary } from '@/components/admin/stills/StillsLibrary';
import { first } from '@/lib/admin/query';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

export default async function AdminPhotosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const [photos, tagOptions, locationOptions] = await Promise.all([
    // Drafts wait on Add media until they are published.
    db.photo.findMany({
      where: { draft: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        imageUrl: true,
        width: true,
        height: true,
        title: true,
        location: true,
        camera: true,
        settings: true,
        avgHue: true,
        avgChroma: true,
        avgLightness: true,
        warmth: true,
        isMonochrome: true,
        takenAt: true,
        createdAt: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    }),
    listTagNames(),
    listPhotoLocations(),
  ]);

  return (
    <StillsLibrary
      photos={photos.map(({ tags, settings, ...photo }) => ({
        ...photo,
        // The Json column is untyped at the DB boundary — coerce it here.
        settings: toSettings(settings),
        tags: tags.map((entry) => entry.tag.name),
      }))}
      tagOptions={tagOptions}
      locationOptions={locationOptions}
      initial={{
        filter: parseFilter(first(params.filter)),
        order: parseOrder(first(params.order)),
        query: first(params.q) ?? '',
        photo: first(params[OPEN_PHOTO_PARAM]) ?? null,
      }}
      // Crafted input like any query parameter, so reduced to a path on this site.
      returnTo={safeNextPath(params[RETURN_PARAM], '') || null}
    />
  );
}

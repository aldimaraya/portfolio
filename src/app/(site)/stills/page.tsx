import { Suspense } from 'react';
import { db } from '@/lib/db';
import { DEFAULT_SORT, sortPhotosForWall } from '@/lib/color/sort';
import { StillsGallery } from '@/components/stills/StillsGallery';
import { toSettings } from '@/lib/photo/settings';

/**
 * Statically rendered and revalidated by the photo actions, so a visitor is
 * served the wall from the CDN rather than waiting on Postgres.
 *
 * The page reads no `searchParams` on purpose: a page that reads them is dynamic
 * by definition. Filtering moved into StillsGallery, which reads the URL on the
 * client — and can, because the wall already needs every photo to pack its rows.
 */
export default async function StillsPage() {
  const photos = await db.photo.findMany({
    // Colour decides the wall order below, but the query still needs one of its
    // own: without it Postgres may return rows in a different order between
    // renders, and photos that tie on hue would shuffle for no visible reason.
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      imageUrl: true,
      width: true,
      height: true,
      location: true,
      camera: true,
      settings: true,
      avgHue: true,
      avgChroma: true,
      avgLightness: true,
      warmth: true,
      isMonochrome: true,
      takenAt: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  // The static HTML is built in the default order; StillsGallery re-sorts from
  // the URL on hydration if the visitor asked for something else.
  const wall = sortPhotosForWall(photos, DEFAULT_SORT).map((photo) => ({
    id: photo.id,
    imageUrl: photo.imageUrl,
    width: photo.width,
    height: photo.height,
    location: photo.location,
    camera: photo.camera,
    // The Json column is untyped at the DB boundary — coerce it here.
    settings: toSettings(photo.settings),
    // Already selected for the wall order; the frame reuses them for its
    // load-time placeholder colour.
    avgHue: photo.avgHue,
    avgChroma: photo.avgChroma,
    avgLightness: photo.avgLightness,
    warmth: photo.warmth,
    isMonochrome: photo.isMonochrome,
    takenAt: photo.takenAt,
    tags: photo.tags.map((entry) => entry.tag.name),
  }));

  return (
    <main>
      {/* useSearchParams needs a Suspense boundary to prerender around: the
          static HTML is built without a query string, and the client fills in
          the filtered view on hydration. */}
      <Suspense fallback={null}>
        <StillsGallery photos={wall} />
      </Suspense>
    </main>
  );
}

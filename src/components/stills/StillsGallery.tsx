'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterBar } from '@/components/site/FilterBar';
import { PolaroidWall } from './PolaroidWall';
import type { PolaroidPhoto } from './Polaroid';
import { filterPhotos, optionsFromPhotos } from '@/lib/filters/apply';
import { parseFilters } from '@/lib/filters/parse';

export interface GalleryPhoto extends PolaroidPhoto {
  /** Tag names, needed here because filtering no longer happens in SQL. */
  tags: string[];
}

/**
 * Owns the filtered view of the wall.
 *
 * Filtering runs here rather than in the page query for two reasons. The page
 * gets to be statically rendered — reading `searchParams` on the server would
 * make it dynamic, and a photography site should come off the CDN. And a chip
 * click stops being a server round-trip: every photo is already in the browser
 * because the wall needs them all to pack its rows, so narrowing is a filter over
 * an array the client is holding.
 *
 * The URL stays the source of truth, so a filtered wall is still a shareable link
 * and the back button still steps through filter changes.
 */
export function StillsGallery({ photos }: { photos: GalleryPhoto[] }) {
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // From the whole library, not the visible subset: a chip must not vanish from
  // under the cursor that just clicked it.
  const options = useMemo(() => optionsFromPhotos(photos), [photos]);

  const visible = useMemo(() => filterPhotos(photos, filters), [photos, filters]);

  return (
    <>
      <FilterBar options={options} active={filters} />
      <PolaroidWall photos={visible} />
    </>
  );
}

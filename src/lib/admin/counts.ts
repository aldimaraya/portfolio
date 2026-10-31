import { cache } from 'react';
import { db } from '@/lib/db';

export type AdminCounts = {
  photos: number;
  videos: number;
  drafts: number;
  /** Photos with no `takenAt`. EXIF is stripped before upload, so only typing it in fixes these. */
  undated: number;
  untagged: number;
  /** Clips with no roll, which the public motion page never lists. */
  unfiled: number;
  /** Stills and clips uploaded through Add media and waiting there to be published. */
  unpublished: number;
  links: number;
};

/**
 * The numbers the admin chrome shows beside each section, and the Overview's
 * "needs attention" list. All counts, so one round of cheap queries per render —
 * and one per request, not two: `cache` lets the layout and the Overview share it.
 */
export const loadAdminCounts = cache(async (): Promise<AdminCounts> => {
  const [photos, videos, drafts, undated, untagged, unfiled, unpublishedPhotos, unpublishedVideos, links] = await Promise.all([
    db.photo.count({ where: { draft: false } }),
    db.video.count({ where: { draft: false } }),
    db.blogPost.count({ where: { draft: true } }),
    db.photo.count({ where: { takenAt: null, draft: false } }),
    db.photo.count({ where: { tags: { none: {} }, draft: false } }),
    db.video.count({ where: { rollId: null, draft: false } }),
    db.photo.count({ where: { draft: true } }),
    db.video.count({ where: { draft: true } }),
    db.siteLink.count(),
  ]);
  return {
    photos,
    videos,
    drafts,
    undated,
    untagged,
    unfiled,
    unpublished: unpublishedPhotos + unpublishedVideos,
    links,
  };
});

/** What the Overview badge counts: things only a person can fix. Drafts are work in progress, not a fault. */
export function attentionCount(counts: AdminCounts): number {
  return counts.undated + counts.untagged + counts.unfiled;
}

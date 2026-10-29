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
};

/**
 * The numbers the admin chrome shows beside each section, and the Overview's
 * "needs attention" list. All counts, so one round of cheap queries per render.
 */
export async function loadAdminCounts(): Promise<AdminCounts> {
  const [photos, videos, drafts, undated, untagged, unfiled] = await Promise.all([
    db.photo.count(),
    db.video.count(),
    db.blogPost.count({ where: { draft: true } }),
    db.photo.count({ where: { takenAt: null } }),
    db.photo.count({ where: { tags: { none: {} } } }),
    db.video.count({ where: { rollId: null } }),
  ]);
  return { photos, videos, drafts, undated, untagged, unfiled };
}

/** What the Overview badge counts: things only a person can fix. Drafts are work in progress, not a fault. */
export function attentionCount(counts: AdminCounts): number {
  return counts.undated + counts.untagged + counts.unfiled;
}

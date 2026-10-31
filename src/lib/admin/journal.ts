import type { PostContent } from '@/lib/post/content';
import { usedJournalPhotos } from '@/lib/post/editor';
import { missingForPublish } from '@/lib/post/form';
import { sectionEntries, unwrittenSections } from '@/lib/post/sections';
import { countOf } from './overview';

/**
 * The admin Journal list's pure half: what a draft card says about the post
 * and what it warns about. The page (app/admin/posts) does the queries.
 */

export const POST_FILTERS = ['all', 'drafts', 'published'] as const;
export type PostFilter = (typeof POST_FILTERS)[number];

/** `?show=` read leniently: anything unrecognised is the whole list, never an error. */
export function parsePostFilter(value: string | undefined): PostFilter {
  return (POST_FILTERS as readonly string[]).includes(value ?? '') ? (value as PostFilter) : 'all';
}

export interface DraftSummary {
  /** "3 days · 1 section · 41 trip photos, 18 placed", or "Empty". */
  meta: string;
  /** Things to finish, worded for a chip. Empty when the draft could go out as it is. */
  warnings: string[];
}

/**
 * What a draft card shows. Warnings are the publish blockers first, then the
 * soft ones: a day with nothing written under it, and trip photos still in
 * the tray. Neither soft one stops a publish — a day of only photos is a
 * choice — but both are usually a post left half-done.
 */
export function summarizeDraft(
  post: { title: string; content: PostContent },
  trayPhotoIds: string[],
): DraftSummary {
  const { blocks } = post.content;
  const entries = sectionEntries(blocks);
  const days = entries.filter((entry) => entry.day !== null).length;
  const sections = entries.length - days;
  const used = usedJournalPhotos(blocks);
  const placed = trayPhotoIds.filter((id) => used.has(id)).length;
  const unplaced = trayPhotoIds.length - placed;

  const parts: string[] = [];
  if (days) parts.push(countOf(days, ['day', 'days']));
  if (sections) parts.push(countOf(sections, ['section', 'sections']));
  if (trayPhotoIds.length) parts.push(`${countOf(trayPhotoIds.length, ['trip photo', 'trip photos'])}, ${placed} placed`);
  if (!parts.length && !blocks.length) parts.push('Empty');

  const warnings = missingForPublish(post).map((missing) => `Needs ${missing}`);
  // An empty post already says so; listing its lack of days too would be noise.
  if (blocks.length) {
    const labels = new Map(entries.map((entry) => [entry.id, entry.label || entry.title || 'A section']));
    for (const id of unwrittenSections(blocks)) warnings.push(`${labels.get(id)} has no text yet`);
  }
  if (unplaced) warnings.push(`${countOf(unplaced, ['photo', 'photos'])} unplaced`);

  return { meta: parts.join(' · '), warnings };
}

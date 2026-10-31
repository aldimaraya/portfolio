import { z } from 'zod';
import type { ContentKind } from '@/lib/newsletter/kinds';

/**
 * What each surface collects. Every kind records views, but only clips and
 * posts *show* them. A photo is seen on the wall, not on a page of its own, so a
 * still's view is a closer look — the lightbox resting on it — rather than a
 * visit, and a public "12 views" beside it would claim more than that. Its count
 * is for the admin's Engagement page alone.
 */
export const LIKEABLE = ['stills', 'motion', 'journal'] as const satisfies readonly ContentKind[];
/** Kinds whose view count is public. */
export const VIEWABLE = ['motion', 'journal'] as const satisfies readonly ContentKind[];

export type LikeableKind = (typeof LIKEABLE)[number];
export type ViewableKind = (typeof VIEWABLE)[number];

export function isViewable(kind: ContentKind): kind is ViewableKind {
  return (VIEWABLE as readonly string[]).includes(kind);
}

// Every id here is a cuid. Held to that shape rather than to "any string", so a
// request cannot spend a database lookup on a kilobyte of junk.
const idSchema = z.string().regex(/^[a-z0-9]{20,32}$/, 'Unknown item');

export const targetSchema = z.object({ kind: z.enum(LIKEABLE), id: idSchema });
export const viewSchema = z.object({ kind: z.enum(LIKEABLE), id: idSchema });
export const likeSchema = targetSchema.extend({ liked: z.boolean() });

export type Target = z.infer<typeof targetSchema>;

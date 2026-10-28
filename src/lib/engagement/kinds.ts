import { z } from 'zod';
import type { ContentKind } from '@/lib/newsletter/kinds';

/**
 * What each surface collects. Stills take likes only: a photo is seen on the
 * wall, not on a page of its own, so there is no single moment that counts as
 * having viewed one — opening the lightbox is a closer look, not a visit.
 */
export const LIKEABLE = ['stills', 'motion', 'journal'] as const satisfies readonly ContentKind[];
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
export const viewSchema = z.object({ kind: z.enum(VIEWABLE), id: idSchema });
export const likeSchema = targetSchema.extend({ liked: z.boolean() });

export type Target = z.infer<typeof targetSchema>;

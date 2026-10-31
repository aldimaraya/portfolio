import { CONTENT_KINDS, type ContentKind } from './kinds';

/**
 * How the next email is arranged beyond which items are in it: the order of its
 * sections, the order within each, and the note at the top. Pure, so the digest,
 * the dispatch and the admin all read one definition.
 */

/** Journal, then Motion, then Stills — the order the email had before it could be changed. */
export const DEFAULT_SECTIONS: readonly ContentKind[] = CONTENT_KINDS;

/**
 * A stored section order made whole: unknown or repeated kinds dropped, missing
 * ones appended in the default order. Stored orders are never trusted to be
 * complete — a row saved before a kind existed would otherwise lose a section.
 */
export function sectionOrder(stored: readonly string[] | null | undefined): ContentKind[] {
  const order: ContentKind[] = [];
  for (const kind of stored ?? []) {
    if ((CONTENT_KINDS as readonly string[]).includes(kind) && !order.includes(kind as ContentKind)) {
      order.push(kind as ContentKind);
    }
  }
  for (const kind of DEFAULT_SECTIONS) if (!order.includes(kind)) order.push(kind);
  return order;
}

/**
 * Swaps two sections. The admin swaps a section with the nearest one that has
 * something in it, so moving Stills above an empty Motion is never a dead click.
 */
export function swapSections(order: ContentKind[], a: ContentKind, b: ContentKind): ContentKind[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i === -1 || j === -1) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Items placed by hand first, in their places, then the rest in the order they
 * were queued. Expects rows already sorted by createdAt and keeps that order
 * among equals, so unmoved items never shuffle.
 */
export function byPosition<T extends { position: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
}

/** Long enough for a few paragraphs; an essay belongs in the journal. */
export const MESSAGE_MAX = 2000;

/** The note as paragraphs: split on blank lines, single breaks kept within one. */
export function messageParagraphs(message: string): string[] {
  return message
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

import { z } from 'zod';

/**
 * The three things a subscriber can opt into, one per public surface. Mirrors
 * the ContentKind enum in schema.prisma — the names are the surfaces rather than
 * the tables so the same word works in the form, the email and the database.
 */
export const CONTENT_KINDS = ['journal', 'motion', 'stills'] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export type Preferences = Record<ContentKind, boolean>;

export const KIND_LABELS: Record<ContentKind, { label: string; blurb: string }> = {
  journal: { label: 'Journal', blurb: 'New posts' },
  motion: { label: 'Motion', blurb: 'New clips' },
  stills: { label: 'Stills', blurb: 'New photos' },
};

/** What a new subscriber starts with: everything, unticked by choice. */
export const DEFAULT_PREFERENCES: Preferences = { journal: true, motion: true, stills: true };

/**
 * At least one must be on. A subscriber who wants none of it wants to
 * unsubscribe, and a row that can never be emailed would still count in the
 * admin's totals and still be kept — the data-minimising answer is to delete it,
 * which the manage page offers instead.
 */
export const preferencesSchema = z
  .object({ journal: z.boolean(), motion: z.boolean(), stills: z.boolean() })
  .refine((prefs) => CONTENT_KINDS.some((kind) => prefs[kind]), {
    message: 'Pick at least one thing to hear about',
  });

export function chosenKinds(prefs: Preferences): ContentKind[] {
  return CONTENT_KINDS.filter((kind) => prefs[kind]);
}

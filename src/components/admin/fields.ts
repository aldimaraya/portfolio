/**
 * Shared form styling for the admin forms. Imported by every admin input —
 * never re-declare these class strings in a form file.
 */

export const FIELD =
  'rounded border border-hairline bg-frame px-3 py-2 text-bone outline-none focus:border-gold';

export const LABEL = 'font-mono text-xs tracking-[0.15em] text-ash uppercase';

export const BUTTON =
  'self-start rounded border border-gold px-4 py-2 text-gold transition hover:bg-gold/10 disabled:opacity-50';

/** The quiet sibling of BUTTON, for a row of actions where gold would shout. */
export const GHOST_BUTTON =
  'inline-flex h-9 items-center rounded-md border border-white/15 px-3.5 text-sm text-bone transition hover:border-gold disabled:opacity-50';

/** The one primary action in a page header, sized to sit beside GHOST_BUTTON. */
export const GOLD_BUTTON =
  'inline-flex h-9 items-center rounded-md bg-gold px-3.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40';

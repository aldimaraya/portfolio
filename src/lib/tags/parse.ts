/**
 * The pure half of the tag helpers. Kept clear of `@/lib/db` so the admin tag
 * editor — a client component — can share the exact same normalisation the
 * server actions apply, rather than re-implementing it and drifting.
 */

export function parseTagNames(input: string): string[] {
  const names = input
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

/** The inverse of `parseTagNames` — the wire format the forms submit. */
export function formatTagNames(names: string[]): string {
  return names.join(', ');
}

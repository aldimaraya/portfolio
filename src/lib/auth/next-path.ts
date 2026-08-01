/**
 * Where to send someone after they sign in. The value arrives from the `next`
 * query parameter, which anybody can craft, so it has to be reduced to a path on
 * this site or thrown away.
 *
 * Prefix-matching the string ("starts with / but not //") is the usual approach
 * and is not enough: browsers normalise backslashes to forward slashes for
 * special schemes, so `/\evil.example` passes that test and then resolves
 * off-origin. Resolving against a placeholder origin and insisting the result
 * stayed there tests the property we actually care about, rather than a
 * hand-listed set of the ways it can be violated.
 */

export const DEFAULT_NEXT = '/admin';

/** A host no real deployment can be, so a match means the input was relative. */
const PLACEHOLDER_ORIGIN = 'https://next-path.invalid';

export function safeNextPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return DEFAULT_NEXT;

  let url: URL;
  try {
    url = new URL(candidate, PLACEHOLDER_ORIGIN);
  } catch {
    return DEFAULT_NEXT;
  }

  // Covers an absolute URL to another host, a protocol-relative `//host`, a
  // backslash-smuggled host, and `javascript:` (whose origin is "null").
  if (url.origin !== PLACEHOLDER_ORIGIN) return DEFAULT_NEXT;

  return `${url.pathname}${url.search}${url.hash}`;
}

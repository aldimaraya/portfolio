/**
 * The one way a post's date is written, so the journal list, a post's own header
 * and the admin list cannot drift into three formats.
 *
 * The locale is pinned rather than left to the runtime: this renders on the
 * server, where the default locale is a property of the host and would otherwise
 * decide the site's date format for it.
 */
export function formatPostDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    // Pinned for the same reason as the locale. `publishedAt` is stored as UTC,
    // so formatting it in the host's zone can land a post on the previous day.
    timeZone: 'UTC',
  });
}

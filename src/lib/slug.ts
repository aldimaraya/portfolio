/**
 * URL slug from a post title. Deliberately ASCII-only: anything outside
 * [a-z0-9] becomes a separator, so a title that transliterates to nothing at all
 * falls back to "post" rather than producing an empty path segment.
 *
 * Uniqueness is not this function's job — see uniqueSlug in
 * src/app/admin/posts/actions.ts, which suffixes collisions.
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'post';
}

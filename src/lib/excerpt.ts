/**
 * Flattens Markdown to a plain-text preview for the journal list.
 *
 * Deliberately a regex pass rather than a parse: the output is one line of prose
 * with every mark stripped, so the structure a real parser recovers would only be
 * thrown away. Rendering the post itself goes through react-markdown — this never
 * produces anything meant to be interpreted as markup.
 */
export function buildExcerpt(markdown: string, maxLength = 180): string {
  const plain = markdown
    // Images first: an embed is also a link, so the link rule would otherwise
    // reduce it to its alt text and leave a stray "!" behind.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxLength) return plain;

  // trimEnd before appending: cutting mid-gap would otherwise leave the ellipsis
  // floating a space away from the last word.
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

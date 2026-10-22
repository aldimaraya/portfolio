import { buildExcerpt, truncate } from '@/lib/excerpt';
import { parseContent, plainText, type PostContent } from './content';

/**
 * A post's one-line summary, for the journal list, the home page, link previews
 * and the newsletter — whichever way the post is stored.
 *
 * Taken from the prose, in order, so it reads as the opening of the post. Tips,
 * lists and captions are left out: a summary that opens on "Travel hack" or on
 * a packing list is not a summary of a trip. A post that is all photos falls
 * back to its section titles, which at least say where it goes.
 */
export function contentExcerpt(content: PostContent, maxLength = 180): string {
  const prose = content.blocks
    .flatMap((block) => (block.type === 'text' ? [plainText(block.body)] : []))
    .filter(Boolean)
    .join(' ');
  if (prose) return truncate(prose, maxLength);

  const titles = content.blocks
    .flatMap((block) => (block.type === 'section' || block.type === 'heading' ? [block.type === 'section' ? block.title : block.text] : []))
    .map((title) => title.trim())
    .filter(Boolean)
    .join(' · ');
  return truncate(titles, maxLength);
}

export function postExcerpt(
  post: { content: unknown; markdownContent: string },
  maxLength = 180,
): string {
  const content = parseContent(post.content);
  return content ? contentExcerpt(content, maxLength) : buildExcerpt(post.markdownContent, maxLength);
}

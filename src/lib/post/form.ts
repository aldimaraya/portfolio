import { hasBody, type PostContent } from './content';

/**
 * What a post still needs before it can be published — the counterpart to
 * publishProblems in src/lib/admin/drafts.ts. Drafts need nothing: a post
 * can be saved half-written. savePost runs the same check server-side; the
 * editor uses it to explain a disabled Publish.
 */
export function missingForPublish(post: { title: string; content: PostContent }): string[] {
  const missing: string[] = [];

  if (!post.title.trim()) missing.push('a title');
  if (!hasBody(post.content)) missing.push('something to read');

  return missing;
}

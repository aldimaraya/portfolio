/**
 * Who points at a piece of media, worked out from the only record there is: the
 * post bodies themselves.
 *
 * `mediaSnippet` writes an R2 URL straight into `markdownContent` and nothing
 * stores the fact that the post now depends on that row, so deleting the photo
 * or clip left every journal entry embedding it serving a 404 — silently, and
 * from a prerendered page, with no back-reference to warn from and no way to
 * find the damage afterwards. A back-reference table is the real fix; it is also
 * a migration, and this repo has no migration history. Until then the body text
 * *is* the index, and the guard reads it.
 */

import { db } from '@/lib/db';
import { escapeMediaUrl } from '@/lib/markdown/media';

export interface PostRef {
  title: string;
  draft: boolean;
}

/**
 * Every spelling of a media URL that could be sitting in a body. A row holds the
 * raw URL; `mediaSnippet` percent-escapes spaces and parens on the way in, so a
 * key containing either is stored in a form that a search for the raw string
 * would miss entirely.
 */
export function mediaUrlForms(urls: string[]): string[] {
  const forms = new Set<string>();
  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed) continue;
    forms.add(trimmed);
    forms.add(escapeMediaUrl(trimmed));
  }
  return [...forms];
}

/**
 * The posts among `posts` whose body names any of `urls`.
 *
 * Substring matching, deliberately: a URL is matched wherever it appears rather
 * than only inside `![](…)`, because a body can also carry one as a plain link
 * or in a hand-written line, and every one of those breaks the same way. The
 * cost is a false positive on a URL that is a strict prefix of another — which
 * refuses a delete that could have been allowed, and that is the side to err on.
 */
export function postsEmbedding<T extends { markdownContent: string }>(
  posts: T[],
  urls: string[],
): T[] {
  const forms = mediaUrlForms(urls);
  if (forms.length === 0) return [];
  return posts.filter((post) => forms.some((form) => post.markdownContent.includes(form)));
}

/**
 * The posts embedding any of these URLs, as stored.
 *
 * The narrowing is done by the database rather than by reading `blogPost` into
 * memory and grepping it: `contains` is `LIKE '%…%'` on an unindexed text
 * column, so this is a sequential scan of the journal either way — but the scan
 * happens where the rows already are, and only the handful that match cross the
 * wire. Grepping in the process would put every body, in full, into the app on
 * every media delete, and grow with the journal forever. It still runs once per
 * delete, and a photo costs one scan where a clip costs one against six
 * patterns; at the scale of a personal journal that is milliseconds, and it is
 * the price of not having a back-reference table.
 *
 * `postsEmbedding` is applied again to the rows that come back, so the matching
 * rule has exactly one definition and the one that is unit-tested is the one
 * that decides.
 */
export async function postsEmbeddingMedia(urls: string[]): Promise<PostRef[]> {
  const forms = mediaUrlForms(urls);
  if (forms.length === 0) return [];

  const candidates = await db.blogPost.findMany({
    where: { OR: forms.map((form) => ({ markdownContent: { contains: form } })) },
    select: { title: true, draft: true, markdownContent: true },
    // Published first, then alphabetical: the entries a reader can already see
    // are the ones to fix first, and a stable order keeps the message readable.
    orderBy: [{ draft: 'asc' }, { title: 'asc' }],
  });

  return postsEmbedding(candidates, urls).map(({ title, draft }) => ({ title, draft }));
}

/** How many titles the refusal spells out before it starts counting instead. */
const LISTED = 5;

/**
 * The refusal an admin reads. Names the entries, because "it is in use
 * somewhere" is not actionable — the whole point is to say which posts to go and
 * fix first.
 *
 * Drafts count. A draft is excluded from the public queries, so nothing it
 * embeds is currently 404ing in front of a reader — but it is the copy still
 * being written, and the one most likely to be published *after* the media is
 * gone, at which point the break is new rather than merely inherited. Filing it
 * under "not published yet, so not your problem" would make the guard's coverage
 * depend on a flag that has nothing to do with whether the reference exists.
 * They are marked as drafts so the admin can judge how urgent each one is.
 */
export function mediaInUseMessage(noun: string, posts: PostRef[]): string {
  const names = posts.map((post) => `“${post.title}”${post.draft ? ' (draft)' : ''}`);
  const shown = names.slice(0, LISTED).join(', ');
  const rest = names.length - LISTED;
  const list = rest > 0 ? `${shown}, and ${rest} more` : shown;
  const entries = names.length === 1 ? 'journal entry' : `${names.length} journal entries`;

  return `Cannot delete this ${noun}: it is embedded in ${entries} — ${list}. Remove it from ${
    names.length === 1 ? 'that entry' : 'those entries'
  } first, then delete it.`;
}

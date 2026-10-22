import Link from 'next/link';
import { formatPostDate } from '@/lib/post/date';
import { postExcerpt } from '@/lib/post/excerpt';

export interface PostListItem {
  id: string;
  slug: string;
  title: string;
  /** Both, because a post not yet saved as blocks is still summarised from its Markdown. */
  content: unknown;
  markdownContent: string;
  publishedAt: Date;
}

/**
 * The journal's contents, ruled off entry by entry with dates in the margin. Shared
 * by /journal and the home page so the latest posts read as a torn-off corner of
 * the same sheet, not a second design for the same list.
 */
export function PostList({
  posts,
  headingLevel = 'h2',
}: {
  posts: PostListItem[];
  /** h3 where the list sits under a section heading of its own, as on the home page. */
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return (
    <ul className="flex flex-col">
      {posts.map((post) => (
        <li key={post.id} className="journal-entry">
          <Link href={`/journal/${post.slug}`} className="group">
            <time dateTime={post.publishedAt.toISOString()} className="journal-margin">
              {formatPostDate(post.publishedAt)}
            </time>

            {/* Only the entry shifts on hover, not the date: the date sits
                against the margin rule, and sliding it would read as the
                rule moving. motion-safe, so a reduced-motion visitor keeps
                the colour change — the row still has to show it is a link. */}
            <div className="transition-transform duration-200 ease-out motion-safe:group-hover:translate-x-1">
              <Heading className="font-journal text-xl font-semibold transition group-hover:text-gold">
                {post.title}
              </Heading>
              {/* Capped independently of the column: at the sheet's width
                  an uncapped excerpt runs past 90 characters a line, which
                  is a long way past comfortable for a summary. */}
              <p className="font-journal mt-2 max-w-[58ch] text-sm leading-relaxed text-ash">
                {postExcerpt(post)}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

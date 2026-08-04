import Link from 'next/link';
import { db } from '@/lib/db';
import { buildExcerpt } from '@/lib/excerpt';
import { formatPostDate } from '@/lib/post/date';

export default async function JournalPage() {
  // Drafts are excluded in the query rather than filtered afterwards: an
  // unpublished post should never reach the client, not even to be dropped there.
  const posts = await db.blogPost.findMany({
    where: { draft: false },
    orderBy: { publishedAt: 'desc' },
  });

  if (posts.length === 0) {
    return (
      <main className="mx-auto max-w-[62rem]">
        <div className="journal-sheet">
          <p className="text-sm text-ash">No posts published yet.</p>
        </div>
      </main>
    );
  }

  return (
    // The contents page of the same notebook: one sheet, entries ruled off from
    // each other, dates in the margin the posts themselves use.
    <main className="mx-auto max-w-[62rem]">
      <div className="journal-sheet">
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
                  <h2 className="font-journal text-xl font-semibold transition group-hover:text-gold">
                    {post.title}
                  </h2>
                  {/* Capped independently of the column: at the sheet's width
                      an uncapped excerpt runs past 90 characters a line, which
                      is a long way past comfortable for a summary. */}
                  <p className="font-journal mt-2 max-w-[58ch] text-sm leading-relaxed text-ash">
                    {buildExcerpt(post.markdownContent)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

import Link from 'next/link';
import { db } from '@/lib/db';
import { buildExcerpt } from '@/lib/excerpt';
import { formatPostDate } from '@/lib/post/date';

export const dynamic = 'force-dynamic';

export default async function JournalPage() {
  // Drafts are excluded in the query rather than filtered afterwards: an
  // unpublished post should never reach the client, not even to be dropped there.
  const posts = await db.blogPost.findMany({
    where: { draft: false },
    orderBy: { publishedAt: 'desc' },
  });

  if (posts.length === 0) {
    return (
      <main>
        <p className="text-sm text-ash">No posts published yet.</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl">
      <ul className="flex flex-col divide-y divide-hairline">
        {posts.map((post) => (
          <li key={post.id} className="py-6">
            <Link href={`/journal/${post.slug}`} className="group block">
              <time
                dateTime={post.publishedAt.toISOString()}
                className="font-mono text-xs tracking-[0.1em] text-gold uppercase"
              >
                {formatPostDate(post.publishedAt)}
              </time>
              <h2 className="mt-1 text-xl transition group-hover:text-gold">{post.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ash">
                {buildExcerpt(post.markdownContent)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

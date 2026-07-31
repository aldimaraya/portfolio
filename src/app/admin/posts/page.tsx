import Link from 'next/link';
import { db } from '@/lib/db';
import { PostForm } from '@/components/admin/PostForm';
import { LABEL } from '@/components/admin/fields';

export const dynamic = 'force-dynamic';

export default async function AdminPostsPage() {
  // Drafts first, then newest published — the drafts are the ones needing work.
  const posts = await db.blogPost.findMany({
    orderBy: [{ draft: 'desc' }, { publishedAt: 'desc' }],
  });

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className={`mb-4 ${LABEL}`}>Write a post</h2>
        <PostForm />
      </section>

      <section>
        <h2 className={`mb-4 ${LABEL}`}>All posts ({posts.length})</h2>
        <ul className="flex flex-col divide-y divide-hairline">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center gap-4 py-3">
              <span
                className={`shrink-0 rounded border px-2 py-0.5 font-mono text-xs ${
                  post.draft ? 'border-hairline text-ash' : 'border-gold text-gold'
                }`}
              >
                {post.draft ? 'draft' : 'live'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{post.title}</div>
                <div className="truncate font-mono text-xs text-ash">
                  /journal/{post.slug} ·{' '}
                  {post.publishedAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </div>
              <Link href={`/admin/posts/${post.id}`} className="shrink-0 text-sm text-gold">
                Edit
              </Link>
            </li>
          ))}
        </ul>
        {posts.length === 0 ? <p className="text-sm text-ash">No posts yet.</p> : null}
      </section>
    </div>
  );
}

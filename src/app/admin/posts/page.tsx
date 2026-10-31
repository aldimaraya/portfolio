import { AdminPage } from '@/components/admin/shell/AdminPage';
import Link from 'next/link';
import { db } from '@/lib/db';
import { NewPostButton } from '@/components/admin/NewPostButton';
import { formatPostDate } from '@/lib/post/date';

export const dynamic = 'force-dynamic';

export default async function AdminPostsPage() {
  // Drafts first, then newest published — the drafts are the ones needing work.
  const posts = await db.blogPost.findMany({
    orderBy: [{ draft: 'desc' }, { publishedAt: 'desc' }],
    select: { id: true, title: true, slug: true, draft: true, publishedAt: true },
  });

  return (
    <AdminPage title="Journal" count={posts.length} actions={<div className="ml-auto"><NewPostButton /></div>}>
      <div className="flex flex-col gap-10">
        <section>
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
                  <div className="truncate text-sm">{post.title || 'Untitled'}</div>
                  <div className="truncate font-mono text-xs text-ash">
                    /journal/{post.slug} ·{' '}
                    {formatPostDate(post.publishedAt)}
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
    </AdminPage>
  );
}

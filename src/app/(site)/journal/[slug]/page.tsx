import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostMarkdown } from '@/components/markdown/PostMarkdown';
import { AdminEditLink } from '@/components/site/AdminEditLink';
import { db } from '@/lib/db';
import { buildExcerpt } from '@/lib/excerpt';
import { formatPostDate } from '@/lib/post/date';

// params is a Promise in Next 16 and must be awaited.
type Params = { params: Promise<{ slug: string }> };

/**
 * Prerenders every published post at build time. Without this the route falls
 * back to rendering on demand, which for the one page type on this site that
 * never changes between edits would mean a database round-trip per reader.
 *
 * Drafts are left out deliberately — they 404 either way, and building a page
 * for one would only put it in the output where it does not belong. A post
 * published after the build is rendered on first request and cached from then
 * on, which is what savePost's revalidatePath keeps honest.
 */
export async function generateStaticParams() {
  const posts = await db.blogPost.findMany({
    where: { draft: false },
    select: { slug: true },
  });
  return posts.map((post) => ({ slug: post.slug }));
}

/** Drafts are unreachable, so a draft slug is a 404 rather than a private page. */
async function publishedPost(slug: string) {
  const post = await db.blogPost.findUnique({ where: { slug } });
  return post && !post.draft ? post : null;
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const post = await publishedPost(slug);
  if (!post) return { title: 'Journal' };

  return {
    title: post.title,
    // The same flattening the list uses, kept short enough for a link preview.
    description: buildExcerpt(post.markdownContent, 160),
  };
}

export default async function JournalPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await publishedPost(slug);
  if (!post) notFound();

  return (
    // Capped and centred rather than left-aligned across the full container: at
    // 1300px the prose column inside the sheet would run well past a readable
    // measure, which is the opposite of the problem this layout solves.
    <main className="mx-auto max-w-[62rem]">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/journal"
          className="font-mono text-xs tracking-[0.1em] text-ash uppercase transition hover:text-gold"
        >
          ← Journal
        </Link>
        <AdminEditLink href={`/admin/posts/${post.id}`} label="Edit post" />
      </div>

      <article className="journal-sheet mt-6">
        <div className="journal-grid">
          {/* The margin. Everything about the post that is not the post. */}
          <div className="journal-margin">
            <time dateTime={post.publishedAt.toISOString()}>{formatPostDate(post.publishedAt)}</time>
          </div>

          <div>
            <h1 className="font-journal text-[2rem] leading-[2.75rem] font-semibold tracking-tight text-balance">
              {post.title}
            </h1>
            <div className="prose-portfolio mt-[1.8125rem]">
              <PostMarkdown>{post.markdownContent}</PostMarkdown>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}

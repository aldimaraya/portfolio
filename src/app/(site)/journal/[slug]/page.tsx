import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
    <main className="max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/journal"
          className="font-mono text-xs tracking-[0.1em] text-ash uppercase transition hover:text-gold"
        >
          ← Journal
        </Link>
        <AdminEditLink href={`/admin/posts/${post.id}`} label="Edit post" />
      </div>

      <article className="mt-6">
        <time
          dateTime={post.publishedAt.toISOString()}
          className="font-mono text-xs tracking-[0.1em] text-gold uppercase"
        >
          {formatPostDate(post.publishedAt)}
        </time>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{post.title}</h1>
        <div className="prose-portfolio mt-8">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.markdownContent}</ReactMarkdown>
        </div>
      </article>
    </main>
  );
}

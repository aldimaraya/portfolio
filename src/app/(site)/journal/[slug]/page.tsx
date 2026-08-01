import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/lib/db';
import { buildExcerpt } from '@/lib/excerpt';
import { formatPostDate } from '@/lib/post/date';

export const dynamic = 'force-dynamic';

// params is a Promise in Next 16 and must be awaited.
type Params = { params: Promise<{ slug: string }> };

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
      <Link
        href="/journal"
        className="font-mono text-xs tracking-[0.1em] text-ash uppercase transition hover:text-gold"
      >
        ← Journal
      </Link>

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

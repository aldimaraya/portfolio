import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PostBody } from '@/components/journal/PostBody';
import { PostSheet } from '@/components/journal/PostSheet';
import { PostSignup } from '@/components/newsletter/PostSignup';
import { AdminEditLink } from '@/components/site/AdminEditLink';
import { db } from '@/lib/db';
import { formatPostDate } from '@/lib/post/date';
import { contentExcerpt } from '@/lib/post/excerpt';
import { loadPostBody } from '@/lib/post/load';
import { firstImage } from '@/lib/post/media';
import { indexEntries } from '@/lib/post/sections';
import { JsonLd } from '@/components/site/JsonLd';
import { articleSchema } from '@/lib/schema';

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

/**
 * Drafts are unreachable, so a draft slug is a 404 rather than a private page.
 * Wrapped in cache() so generateMetadata and the page share one read of the
 * post and its media rather than making two.
 */
const publishedPost = cache(async (slug: string) => {
  const post = await db.blogPost.findUnique({ where: { slug } });
  if (!post || post.draft) return null;
  return { ...post, ...(await loadPostBody(post)) };
});

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const post = await publishedPost(slug);
  if (!post) return { title: 'Journal' };

  // The same summary the list uses, kept short enough for a link preview.
  const description = contentExcerpt(post.content, 160);
  // The post's own first photo, where it has one, rather than the site card:
  // a trip shared in a chat should unfurl as the trip.
  const image = firstImage(post.content.blocks, post.media);

  return {
    title: post.title,
    description,
    alternates: { canonical: `/journal/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      url: `/journal/${post.slug}`,
      publishedTime: post.publishedAt.toISOString(),
      ...(image ? { images: [{ url: image.url, width: image.width, height: image.height }] } : {}),
    },
  };
}

export default async function JournalPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await publishedPost(slug);
  if (!post) notFound();

  return (
    // The whole container, like the stills and motion pages. The text keeps a
    // reading measure inside the sheet; the width beyond it goes to the margin,
    // the index rail and photos set wide (see PostSheet).
    <main>
      <JsonLd
        schema={articleSchema({
          slug: post.slug,
          title: post.title,
          description: contentExcerpt(post.content, 160),
          publishedAt: post.publishedAt,
        })}
      />
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/journal"
          className="font-mono text-xs tracking-[0.1em] text-ash uppercase transition hover:text-gold"
        >
          ← Journal
        </Link>
        <AdminEditLink href={`/admin/posts/${post.id}`} label="Edit post" />
      </div>

      <PostSheet
        frameClassName="mt-6"
        margin={<time dateTime={post.publishedAt.toISOString()}>{formatPostDate(post.publishedAt)}</time>}
        title={<h1 className="post-title">{post.title}</h1>}
        index={indexEntries(post.content.blocks)}
        after={<PostSignup />}
      >
        <PostBody blocks={post.content.blocks} media={post.media} />
      </PostSheet>
    </main>
  );
}

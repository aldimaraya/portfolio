import { notFound } from 'next/navigation';
import { PostEditor } from '@/components/admin/post-editor/PostEditor';
import { db } from '@/lib/db';
import { parseContent } from '@/lib/post/content';
import { loadPostBody } from '@/lib/post/load';

export const dynamic = 'force-dynamic';

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await db.blogPost.findUnique({
    where: { id },
    include: {
      // Every photo uploaded into the post, used by a block or not: the tray
      // shows them all.
      photos: {
        select: { id: true, imageUrl: true, width: true, height: true, takenAt: true, category: true },
        orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!post) notFound();

  const { content, media } = await loadPostBody(post);

  return (
    <PostEditor
      post={{ id: post.id, slug: post.slug, title: post.title, draft: post.draft, publishedAt: post.publishedAt }}
      blocks={content.blocks}
      media={{ stills: media.stills, clips: media.clips }}
      trayPhotos={post.photos}
      converted={parseContent(post.content) === null}
    />
  );
}

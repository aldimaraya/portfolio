import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PostForm } from '@/components/admin/PostForm';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { LABEL } from '@/components/admin/fields';
import { deletePost } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h2 className={LABEL}>Edit post</h2>
      <PostForm
        initial={{
          id: post.id,
          slug: post.slug,
          title: post.title,
          markdownContent: post.markdownContent,
          draft: post.draft,
        }}
      />
      <DeleteButton
        id={post.id}
        action={deletePost}
        redirectTo="/admin/posts"
        label="Delete post"
      />
    </div>
  );
}

import { PostList } from '@/components/journal/PostList';
import { db } from '@/lib/db';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Journal',
  description:
    'Notes by Aldi Maraya on photography, filmmaking, and how the work gets made.',
  alternates: { canonical: '/journal' },
};

export default async function JournalPage() {
  // Drafts are excluded in the query rather than filtered afterwards: an
  // unpublished post should never reach the client, not even to be dropped there.
  const posts = await db.blogPost.findMany({
    where: { draft: false },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, slug: true, title: true, content: true, markdownContent: true, publishedAt: true },
  });

  if (posts.length === 0) {
    return (
      <main>
        <div className="journal-sheet">
          <p className="text-sm text-ash">No posts published yet.</p>
        </div>
      </main>
    );
  }

  return (
    // The contents page of the same notebook: one sheet, entries ruled off from
    // each other, dates in the margin the posts themselves use. Full width, like
    // a post's own sheet and the other surfaces; the excerpts keep their own cap.
    <main>
      <div className="journal-sheet">
        <PostList posts={posts} />
      </div>
    </main>
  );
}

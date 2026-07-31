import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { VideoForm } from '@/components/admin/VideoForm';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { LABEL } from '@/components/admin/fields';
import { deleteVideo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await db.video.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });
  if (!video) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h2 className={LABEL}>Edit video</h2>
      <VideoForm
        initial={{
          id: video.id,
          videoUrl: video.videoUrl,
          posterImageUrl: video.posterImageUrl,
          spriteUrl: video.spriteUrl,
          spriteFrames: video.spriteFrames,
          width: video.width,
          height: video.height,
          title: video.title,
          description: video.description,
          tags: video.tags.map((entry) => entry.tag.name).join(', '),
        }}
      />
      <DeleteButton
        id={video.id}
        action={deleteVideo}
        redirectTo="/admin/videos"
        label="Delete video"
      />
    </div>
  );
}

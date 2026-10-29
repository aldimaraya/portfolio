import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { VideoForm } from '@/components/admin/VideoForm';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { LABEL } from '@/components/admin/fields';
import { safeNextPath } from '@/lib/auth/next-path';
import { RETURN_PARAM } from '@/lib/photo/lightbox-link';
import { deleteVideo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Set when the edit was opened from the clip's own page, so a save lands back
  // there. Anyone can craft this link, so it is reduced to a path on this site
  // before the form is allowed to navigate to it — see lib/video/edit-link.
  const returnTo = safeNextPath((await searchParams)[RETURN_PARAM], '/admin/videos');
  const [video, tagOptions, rolls] = await Promise.all([
    db.video.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } } },
    }),
    listTagNames(),
    db.roll.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    }),
  ]);
  if (!video) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h2 className={LABEL}>Edit video</h2>
      <VideoForm
        tagOptions={tagOptions}
        rolls={rolls}
        returnTo={returnTo}
        initial={{
          id: video.id,
          videoUrl: video.videoUrl,
          posterImageUrl: video.posterImageUrl,
          spriteUrl: video.spriteUrl,
          spriteFrames: video.spriteFrames,
          width: video.width,
          height: video.height,
          durationSeconds: video.durationSeconds,
          title: video.title,
          description: video.description,
          rollId: video.rollId ?? '',
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

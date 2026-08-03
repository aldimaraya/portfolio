import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { VideoForm } from '@/components/admin/VideoForm';
import { VideoList } from '@/components/admin/VideoList';
import { LABEL } from '@/components/admin/fields';

export const dynamic = 'force-dynamic';

export default async function AdminVideosPage() {
  const [videos, tagOptions] = await Promise.all([
    db.video.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { tags: { include: { tag: true } } },
    }),
    listTagNames(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className={`mb-4 ${LABEL}`}>Add a video</h2>
        <VideoForm tagOptions={tagOptions} />
      </section>

      <section>
        <h2 className={`mb-4 ${LABEL}`}>All videos ({videos.length})</h2>
        <VideoList
          videos={videos.map((video) => ({
            id: video.id,
            title: video.title,
            description: video.description,
            posterImageUrl: video.posterImageUrl,
            spriteFrames: video.spriteFrames,
            tags: video.tags.map((entry) => entry.tag.name),
          }))}
        />
      </section>
    </div>
  );
}

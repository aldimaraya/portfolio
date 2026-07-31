import Link from 'next/link';
import { db } from '@/lib/db';
import { VideoForm } from '@/components/admin/VideoForm';
import { LABEL } from '@/components/admin/fields';

export const dynamic = 'force-dynamic';

export default async function AdminVideosPage() {
  const videos = await db.video.findMany({
    orderBy: [{ rollGroup: 'asc' }, { sortOrder: 'asc' }],
    include: { tags: { include: { tag: true } } },
  });

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className={`mb-4 ${LABEL}`}>Add a video</h2>
        <VideoForm />
      </section>

      <section>
        <h2 className={`mb-4 ${LABEL}`}>All videos ({videos.length})</h2>
        <ul className="flex flex-col divide-y divide-hairline">
          {videos.map((video) => (
            <li key={video.id} className="flex items-center gap-4 py-3">
              {/* Plain <img>: a tiny admin thumbnail, not worth an optimisation
                  request each. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={video.posterImageUrl}
                alt=""
                className="h-12 w-16 rounded bg-black object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{video.title}</div>
                <div className="truncate font-mono text-xs text-ash">
                  {[
                    `${video.rollGroup} #${video.sortOrder}`,
                    `${video.spriteFrames} frames`,
                    video.tags.map((entry) => entry.tag.name).join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Link href={`/admin/videos/${video.id}`} className="text-sm text-gold">
                Edit
              </Link>
            </li>
          ))}
        </ul>
        {videos.length === 0 ? <p className="text-sm text-ash">No videos yet.</p> : null}
      </section>
    </div>
  );
}

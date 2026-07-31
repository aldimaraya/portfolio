import { db } from '@/lib/db';
import { FilmStrip } from '@/components/motion/FilmStrip';

export const dynamic = 'force-dynamic';

export default async function MotionPage() {
  // One flat list in the order set by dragging rows in the admin — no rolls to
  // group by, and no filter bar: videos carry neither a camera nor a location.
  const videos = await db.video.findMany({ orderBy: { sortOrder: 'asc' } });

  return (
    <main>
      <FilmStrip
        videos={videos.map((video) => ({
          id: video.id,
          videoUrl: video.videoUrl,
          posterImageUrl: video.posterImageUrl,
          spriteUrl: video.spriteUrl,
          spriteFrames: video.spriteFrames,
          title: video.title,
          description: video.description,
        }))}
      />
    </main>
  );
}

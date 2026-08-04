import { db } from '@/lib/db';
import { MotionRoll } from '@/components/motion/MotionRoll';
import { rollDuration } from '@/lib/video/duration';

/**
 * The roll. One flat list in the order set by dragging rows in the admin — no
 * rolls to group by, and no filter bar: videos carry neither a camera nor a
 * location.
 *
 * The clips themselves live at /motion/[id], so this page mounts no video
 * element at all: arriving costs one sprite sheet per row and nothing else.
 */
export default async function MotionPage() {
  const videos = await db.video.findMany({
    orderBy: { sortOrder: 'asc' },
    // Only what a row draws. The video and poster URLs belong to the clip page,
    // and selecting them here would ship them to the browser for every clip
    // nobody opens.
    select: {
      id: true,
      spriteUrl: true,
      spriteFrames: true,
      width: true,
      height: true,
      durationSeconds: true,
      title: true,
      description: true,
    },
  });

  // A floor, not an estimate: clips stored before durationSeconds existed count
  // for nothing, so the total is only shown once it means something.
  const { total, unknown } = rollDuration(videos.map((video) => video.durationSeconds));

  return (
    <main>
      <div className="mb-6 flex items-baseline gap-4">
        <h2 className="text-xl font-semibold tracking-tight uppercase">Motion</h2>
        <span className="font-mono text-xs text-ash">
          {videos.length} {videos.length === 1 ? 'clip' : 'clips'} on the roll
          {/* Hidden outright while any clip's length is unknown rather than
              shown with a caveat: a running time that is quietly short is worse
              than no running time, and the caveat would need more words than
              the number is worth. */}
          {total && unknown === 0 ? ` · ${total}` : ''}
        </span>
      </div>

      <MotionRoll clips={videos} />
    </main>
  );
}

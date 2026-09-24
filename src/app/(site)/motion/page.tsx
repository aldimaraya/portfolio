import { db } from '@/lib/db';
import { MotionRoll } from '@/components/motion/MotionRoll';
import { rollDuration } from '@/lib/video/duration';
import { CLIP_ORDER, loadRolls } from '@/lib/video/load-rolls';
import { groupIntoRolls } from '@/lib/video/roll';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Motion',
  description: 'Rolls of films and motion work by Aldi Maraya.',
  alternates: { canonical: '/motion' },
};

/**
 * The rolls, stacked. Each is its own strip — heading, rail, spool — in the
 * order set in the admin, and the page scrolls through all of them rather than
 * switching between them: there are few enough clips that hiding most of them
 * behind a tab would cost more than it saves. No filter bar: videos carry
 * neither a camera nor a location.
 *
 * The clips themselves live at /motion/[id], so this page mounts no video
 * element at all: arriving costs one sprite sheet per row and nothing else.
 */
export default async function MotionPage() {
  const [rolls, videos] = await Promise.all([
    loadRolls(),
    db.video.findMany({
      orderBy: [...CLIP_ORDER],
      // Only what a row draws. The video and poster URLs belong to the clip
      // page, and selecting them here would ship them to the browser for every
      // clip nobody opens.
      select: {
        id: true,
        rollId: true,
        spriteUrl: true,
        spriteFrames: true,
        width: true,
        height: true,
        durationSeconds: true,
        title: true,
        description: true,
      },
    }),
  ]);

  const grouped = groupIntoRolls(rolls, videos);

  return (
    <main>
      <div className="mb-6 flex items-baseline gap-4">
        <h2 className="text-xl font-semibold tracking-tight uppercase">Motion</h2>
        <span className="font-mono text-xs text-ash">
          {/* One roll is not worth counting — it is just "the roll". */}
          {grouped.length > 1 ? `${grouped.length} rolls · ` : ''}
          {videos.length} {videos.length === 1 ? 'clip' : 'clips'}
        </span>
      </div>

      {grouped.length === 0 ? <p className="text-sm text-ash">No clips yet.</p> : null}

      <div className="flex flex-col gap-12 max-strip:gap-9">
        {grouped.map((roll) => {
          // A floor, not an estimate: clips stored before durationSeconds existed
          // count for nothing, so the total is only shown once it means something.
          const { total, unknown } = rollDuration(roll.clips.map((clip) => clip.durationSeconds));

          return (
            // The anchor is what a clip page's "back to the roll" returns to, so
            // leaving the fourth roll's clip does not drop the visitor at the top
            // of the first. Falls back to a letter for the unnamed stand-in roll.
            <section
              key={roll.id || roll.letter}
              id={`roll-${roll.letter.toLowerCase()}`}
              aria-labelledby={`roll-${roll.letter.toLowerCase()}-title`}
              className="scroll-mt-6"
            >
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3
                  id={`roll-${roll.letter.toLowerCase()}-title`}
                  className="text-sm font-bold tracking-[0.08em] uppercase"
                >
                  <span className="font-mono text-gold">Roll {roll.letter}</span>
                  {roll.name ? <span> — {roll.name}</span> : null}
                </h3>
                <span className="font-mono text-xs text-ash">
                  {roll.clips.length} {roll.clips.length === 1 ? 'clip' : 'clips'}
                  {/* Hidden outright while any clip's length is unknown rather
                      than shown with a caveat: a running time that is quietly
                      short is worse than no running time, and the caveat would
                      need more words than the number is worth. */}
                  {total && unknown === 0 ? ` · ${total}` : ''}
                </span>
                {roll.description ? (
                  <p className="w-full max-w-[62ch] font-mono text-xs leading-relaxed text-ash">
                    {roll.description}
                  </p>
                ) : null}
              </div>

              <MotionRoll clips={roll.clips} letter={roll.letter} />
            </section>
          );
        })}
      </div>
    </main>
  );
}

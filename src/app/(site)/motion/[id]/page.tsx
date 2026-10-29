import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminEditLink } from '@/components/site/AdminEditLink';
import { LikeButton } from '@/components/engagement/LikeButton';
import { ViewCount } from '@/components/engagement/ViewCount';
import { ClipStage } from '@/components/motion/ClipStage';
import { db } from '@/lib/db';
import { formatDuration } from '@/lib/video/duration';
import { JsonLd } from '@/components/site/JsonLd';
import { videoSchema } from '@/lib/schema';
import { CLIP_ORDER, loadRolls } from '@/lib/video/load-rolls';
import { frameCode, groupIntoRolls, locateClip } from '@/lib/video/roll';
import { editVideoHref } from '@/lib/video/edit-link';

// params is a Promise in Next 16 and must be awaited.
type Params = { params: Promise<{ id: string }> };

/**
 * Prerenders every clip at build time, for the same reason the journal does: a
 * clip page changes only when it is edited, and rendering on demand would put a
 * database round-trip in front of a page whose content is fixed. saveVideo's
 * revalidatePath keeps them honest after an edit.
 */
export async function generateStaticParams() {
  const videos = await db.video.findMany({ select: { id: true } });
  return videos.map((video) => ({ id: video.id }));
}

/**
 * The clip, its neighbours, and its place on its roll. Position exists only as
 * an ordering, so every roll has to be read to know it — and read through the
 * same grouping /motion uses, or the frame code printed here could disagree
 * with the one on the row that linked to it.
 */
async function loadClip(id: string) {
  const [rolls, videos] = await Promise.all([
    loadRolls(),
    db.video.findMany({
      orderBy: [...CLIP_ORDER],
      select: {
        id: true,
        rollId: true,
        videoUrl: true,
        posterImageUrl: true,
        width: true,
        height: true,
        durationSeconds: true,
        title: true,
        description: true,
        youtubeId: true,
        // Not drawn anywhere — it is the VideoObject's uploadDate, which Google
        // requires before a clip is eligible for a video result at all.
        createdAt: true,
      },
    }),
  ]);

  return locateClip(groupIntoRolls(rolls, videos), id);
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const found = await loadClip(id);
  if (!found) return { title: 'Motion' };

  return {
    title: found.clip.title,
    description: found.clip.description || undefined,
    alternates: { canonical: `/motion/${id}` },
  };
}

export default async function ClipPage({ params }: Params) {
  const { id } = await params;
  const found = await loadClip(id);
  if (!found) notFound();

  const { roll, clip, index, previous, next } = found;
  const runtime = formatDuration(clip.durationSeconds);
  const rollLabel = roll.name ? `Roll ${roll.letter} — ${roll.name}` : `Roll ${roll.letter}`;

  return (
    // Capped rather than run across the full 1300px container: a player as wide
    // as the stills wall would put the controls a mouse-travel away from the
    // frame. The description keeps its own 62ch measure, so this cap is the
    // player's alone — theater mode is there for anyone who wants it wider.
    <main className="mx-auto max-w-[76rem]">
      <JsonLd schema={videoSchema(clip)} />
      <div className="mb-2 flex items-center justify-between gap-4">
        {/* To this clip's roll, not the top of the page: from the fourth roll,
            "back" means back to the fourth roll. */}
        <Link
          href={`/motion#roll-${roll.letter.toLowerCase()}`}
          className="min-w-0 truncate font-mono text-xs tracking-[0.1em] text-ash uppercase transition hover:text-gold"
        >
          ← {rollLabel}
        </Link>
        <AdminEditLink href={editVideoHref(clip.id)} label="Edit clip" />
      </div>

      <ClipStage clip={clip} index={index} letter={roll.letter} />

      {/* No film rail down this side, unlike the roll: there it carries the
          clips and turns with the scroll, and here, with one clip and nothing
          moving, it was only a stripe beside the text. */}
      <div className="mt-4">
        {/* Title, like and identifiers on one line where there is room for
            them: the 23.5rem this page reserves for its own chrome is only
            affordable if the block under the frame is genuinely compact — every
            row here is height taken from the frame. The like sits with the
            title rather than on a row of its own for exactly that reason; the
            frame line stays apart from it, because that is the clip's identity
            and a count that changes under the reader does not belong in it.
            The counts are fetched after hydration, never in the HTML — the
            page is static and shared by every visitor (see useEngagement). */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-balance uppercase">
              {clip.title}
            </h2>
            {/* A labelled pill, not a bare heart: set small, it read as decoration. */}
            <LikeButton kind="motion" id={clip.id} view variant="pill" />
            <ViewCount
              kind="motion"
              id={clip.id}
              className="font-mono text-[0.7rem] tracking-[0.05em] text-ash"
            />
          </div>
          <p className="font-mono text-[0.7rem] tracking-[0.1em] text-gold uppercase tabular-nums">
            Frame {frameCode(index, roll.letter)} · {index + 1} of {roll.clips.length}
            {runtime ? ` · ${runtime}` : ''}
          </p>
        </div>

        {clip.description ? (
          <p className="mt-2 max-w-[62ch] font-mono text-sm leading-relaxed text-ash">
            {clip.description}
          </p>
        ) : null}

        {/* Prev/next along the roll rather than a grid of "more clips": the
            order is deliberate, so the useful next thing is the next one. It
            stops at the roll's ends rather than running into the next roll —
            see locateClip.
            Below the fold by design — it is what you want after the clip, not
            during it, so it is not charged to the height budget above. */}
        <nav className="mt-6 flex gap-4 border-t border-hairline pt-5">
          <ClipLink clip={previous} label="Previous" />
          <ClipLink clip={next} label="Next" align="right" />
        </nav>
      </div>
    </main>
  );
}

/** One end of the pager. Renders a dead slot at the ends, so the pair stays put. */
function ClipLink({
  clip,
  label,
  align = 'left',
}: {
  clip: { id: string; title: string } | null;
  label: string;
  align?: 'left' | 'right';
}) {
  const alignment = align === 'right' ? 'text-right' : '';

  if (!clip) {
    return (
      <div className={`min-w-0 flex-1 rounded border border-hairline px-4 py-3.5 opacity-30 ${alignment}`}>
        <span className="block font-mono text-[0.62rem] tracking-[0.12em] text-ash uppercase">
          {label}
        </span>
        <span className="mt-1 block text-[0.8rem] font-semibold uppercase">End of the roll</span>
      </div>
    );
  }

  return (
    <Link
      href={`/motion/${clip.id}`}
      // min-w-0 is what lets the title below actually truncate: a flex item
      // defaults to min-width:auto, so without it the pair is forced as wide as
      // its longest clip title and pushes the whole page sideways on a phone.
      className={`min-w-0 flex-1 rounded border border-hairline px-4 py-3.5 transition hover:border-gold hover:bg-white/[0.03] ${alignment}`}
    >
      <span className="block font-mono text-[0.62rem] tracking-[0.12em] text-ash uppercase">
        {label}
      </span>
      <span className="mt-1 block truncate text-[0.8rem] font-semibold tracking-[0.03em] uppercase">
        {clip.title}
      </span>
    </Link>
  );
}

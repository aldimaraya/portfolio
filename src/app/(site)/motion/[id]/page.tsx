import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminEditLink } from '@/components/site/AdminEditLink';
import { ClipStage } from '@/components/motion/ClipStage';
import { FilmRail, frameCode } from '@/components/motion/FilmRail';
import { db } from '@/lib/db';
import { formatDuration } from '@/lib/video/duration';
import { JsonLd } from '@/components/site/JsonLd';
import { videoSchema } from '@/lib/schema';

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
 * The clip, its neighbours, and its place on the roll — in one query rather than
 * four. Position is what the frame code and the pager are both built from, and
 * it exists only as an ordering, so the roll has to be read to know it.
 */
async function loadClip(id: string) {
  const roll = await db.video.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      videoUrl: true,
      posterImageUrl: true,
      width: true,
      height: true,
      durationSeconds: true,
      title: true,
      description: true,
      // Not drawn anywhere — it is the VideoObject's uploadDate, which Google
      // requires before a clip is eligible for a video result at all.
      createdAt: true,
    },
  });

  const index = roll.findIndex((video) => video.id === id);
  if (index === -1) return null;

  return {
    clip: roll[index],
    index,
    total: roll.length,
    previous: roll[index - 1] ?? null,
    next: roll[index + 1] ?? null,
  };
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

  const { clip, index, total, previous, next } = found;
  const runtime = formatDuration(clip.durationSeconds);

  return (
    // Capped rather than run across the full 1300px container: a player as wide
    // as the stills wall would put the controls a mouse-travel away from the
    // frame, and the description beside it would run past a readable measure.
    <main className="mx-auto max-w-[62rem]">
      <JsonLd schema={videoSchema(clip)} />
      <div className="mb-3 flex items-center justify-between gap-4">
        <Link
          href="/motion"
          className="font-mono text-xs tracking-[0.1em] text-ash uppercase transition hover:text-gold"
        >
          ← Back to the roll
        </Link>
        <AdminEditLink href={`/admin/videos/${clip.id}`} label="Edit clip" />
      </div>

      <ClipStage clip={clip} index={index} />

      {/* The same rail as the roll, so the clip reads as a place on the film
          rather than a page of its own. Static — nothing is transporting here. */}
      <div className="mt-4 flex">
        <FilmRail />
        <div className="min-w-0 flex-1 pl-6 max-strip:pl-4">
          {/* Title and identifiers on one line where there is room for them: the
              23rem this page reserves for its own chrome is only affordable if
              the block under the frame is genuinely compact, and a heading with
              its metadata stacked underneath is two lines saying one thing. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-balance uppercase">
              {clip.title}
            </h2>
            <p className="font-mono text-[0.7rem] tracking-[0.1em] text-gold uppercase tabular-nums">
              Frame {frameCode(index)} · {index + 1} of {total}
              {runtime ? ` · ${runtime}` : ''}
            </p>
          </div>

          {clip.description ? (
            <p className="mt-2 max-w-[62ch] font-mono text-sm leading-relaxed text-ash">
              {clip.description}
            </p>
          ) : null}

          {/* Prev/next along the roll rather than a grid of "more clips": the
              order is deliberate, so the useful next thing is the next one.
              Below the fold by design — it is what you want after the clip, not
              during it, so it is not charged to the height budget above. */}
          <nav className="mt-6 flex gap-4 border-t border-hairline pt-5">
            <ClipLink clip={previous} label="Previous" />
            <ClipLink clip={next} label="Next" align="right" />
          </nav>
        </div>
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

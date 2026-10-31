'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { deleteVideo, saveVideoDetails, setVideoPoster, type VideoDetailsInput } from '@/app/admin/videos/actions';
import { encodedFilename } from '@/lib/photo/compress';
import { uploadFile } from '@/lib/storage/upload-client';
import { isCustomPoster } from '@/lib/video/cover';
import { formatDuration } from '@/lib/video/duration';
import { cutFrame, loadSprite } from '@/lib/video/frame-poster-client';
import { formatTagNames } from '@/lib/tags/parse';
import { SelectField } from '../add/SuggestField';
import { DeleteButton } from '../DeleteButton';
import { FIELD, LABEL } from '../fields';
import { InspectorTags, REVEAL, STEP, SaveStatus, useAutosave } from '../inspector';
import { Icon } from '../shell/Icon';
import type { Clip, ClipPlace } from './MotionLibrary';

type Draft = Omit<VideoDetailsInput, 'id'>;

const ACTION = 'rounded border border-hairline px-3 py-2 transition hover:border-white/40 disabled:opacity-40';

function draftOf(clip: Clip): Draft {
  return {
    title: clip.title,
    description: clip.description,
    youtubeUrl: clip.youtubeUrl,
    rollId: clip.rollId,
    tags: formatTagNames(clip.tags),
  };
}

/** The stored file's name, to name a cut poster after — as VideoForm names its own. */
function baseName(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return name.replace(/\.[^.]+$/, '') || 'clip';
  } catch {
    return 'clip';
  }
}

/**
 * Edits the selected clip in place, autosaving like the Stills inspector. The
 * thumbnail is picked from the clip's own scrub frames, which are already
 * stored, so a pick is one small upload. Redoing the frames themselves, or
 * using an image of your own, means fetching the whole clip back — that stays
 * on the clip's preview page, linked at the foot, rather than in a column that
 * is clicked through quickly.
 */
export function ClipInspector({
  clip,
  place,
  rolls,
  tagOptions,
  returnTo,
  canNudge,
  onNudge,
  onStep,
  onClose,
}: {
  clip: Clip;
  place: ClipPlace;
  rolls: { id: string; name: string }[];
  tagOptions: string[];
  /** The clip's own page, when that is where the edit started. */
  returnTo: string | null;
  canNudge: { up: boolean; down: boolean };
  onNudge: (delta: -1 | 1) => void;
  onStep: (delta: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(clip));
  const { status, queue } = useAutosave(saveVideoDetails);
  const ids = useId();

  function edit(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    queue({ id: clip.id, ...next });
  }

  const duration = formatDuration(clip.durationSeconds);
  const ratio = clip.width && clip.height ? `${clip.width} / ${clip.height}` : '16 / 9';
  const total = place.group.clips.length;

  return (
    <aside
      aria-label="Selected clip"
      // Sized by InspectorDrawer: a sheet on a phone, a column from lg up.
      className="flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-film pb-[env(safe-area-inset-bottom)] lg:w-(--inspector-w) lg:shrink-0 lg:border-l lg:border-hairline"
    >
      {/* The whole header is the sheet's handle, so it swipes closed however far down the panel is scrolled. */}
      <div data-sheet-handle className="sticky top-0 z-10 border-b border-hairline bg-film px-4 pt-2 pb-3 lg:pt-3.5 lg:pb-3.5">
        <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-white/25 lg:hidden" />
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous clip" onClick={() => onStep(-1)} className={STEP}>
            ‹
          </button>
          <button type="button" aria-label="Next clip" onClick={() => onStep(1)} className={STEP}>
            ›
          </button>
          <span className="min-w-0 truncate font-mono text-[11px] text-ash tabular-nums">
            {place.group.name} · {place.slot.index + 1} of {total}
          </span>
          <SaveStatus status={status} />
          <button
            type="button"
            aria-label="Close"
            title="Close (Esc)"
            onClick={onClose}
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-md text-ash transition-colors hover:bg-white/8 hover:text-bone lg:size-8"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 lg:p-[18px]">
        {/* preload="none": stepping through the board should not start pulling
            a clip per step. The poster is what shows until play is pressed. */}
        <video
          key={clip.posterImageUrl}
          src={clip.videoUrl}
          poster={clip.posterImageUrl}
          controls
          playsInline
          preload="none"
          style={{ aspectRatio: ratio }}
          className={`max-h-[50vh] w-full rounded bg-black object-contain ${REVEAL}`}
        />

        <FramePicker clip={clip} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-title`} className={LABEL}>
            Title
          </label>
          <input
            id={`${ids}-title`}
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
            className={`${FIELD} ${draft.title.trim() ? '' : 'border-amber-400/70'}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-description`} className={LABEL}>
            Description
          </label>
          <textarea
            id={`${ids}-description`}
            rows={2}
            value={draft.description}
            onChange={(event) => edit({ description: event.target.value })}
            placeholder="Optional"
            className={`${FIELD} resize-y`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={LABEL}>Roll</span>
            {/* A new roll goes to the end of it, as a drag onto its foot would. */}
            <SelectField
              label="Roll"
              value={draft.rollId}
              onChange={(rollId) => edit({ rollId })}
              options={rolls.map((roll) => ({ value: roll.id, label: roll.name }))}
              placeholder="Pick a roll"
              className={`${FIELD} w-full ${draft.rollId ? '' : 'border-amber-400/70'}`}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${ids}-youtube`} className={LABEL}>
              YouTube
            </label>
            <input
              id={`${ids}-youtube`}
              value={draft.youtubeUrl}
              onChange={(event) => edit({ youtubeUrl: event.target.value })}
              placeholder="4K link, optional"
              className={`${FIELD} min-w-0`}
            />
          </div>
        </div>

        <InspectorTags value={draft.tags} onChange={(tags) => edit({ tags })} suggestions={tagOptions} />

        <div className="flex flex-wrap items-center gap-2">
          <span className={`${LABEL} mr-auto`}>Position</span>
          <button type="button" onClick={() => onNudge(-1)} disabled={!canNudge.up} title="⌥↑" className={`${ACTION} text-sm`}>
            ↑ Up
          </button>
          <button type="button" onClick={() => onNudge(1)} disabled={!canNudge.down} title="⌥↓" className={`${ACTION} text-sm`}>
            ↓ Down
          </button>
        </div>

        <p className="font-mono text-[11px] text-ash">
          {[clip.width && clip.height ? `${clip.width}×${clip.height}` : null, duration, `${clip.spriteFrames} preview frames`]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="flex flex-wrap gap-2 border-t border-hairline pt-4 text-sm">
          <Link href={returnTo ?? `/motion/${encodeURIComponent(clip.id)}`} className={ACTION}>
            {returnTo ? '‹ Back to the clip' : 'Open page ↗'}
          </Link>
          <Link href={`/admin/videos/${encodeURIComponent(clip.id)}`} className={ACTION}>
            Redo preview or cover…
          </Link>
        </div>
        <DeleteButton id={clip.id} action={deleteVideo} redirectTo="/admin/videos" label="Delete clip" />
      </div>
    </aside>
  );
}

/**
 * The scrub strip's frames as one-click thumbnails. Saved straight away rather
 * than with the autosave: it is an upload, not a keystroke, and there is
 * nothing to debounce.
 */
function FramePicker({ clip }: { clip: Clip }) {
  const frames = Math.max(1, clip.spriteFrames);
  const [working, setWorking] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState('');
  // Decoded once per inspector, so trying a few frames is one download.
  const sprite = useRef<Promise<ImageBitmap> | null>(null);
  const cover = isCustomPoster(clip.posterImageUrl);

  useEffect(
    () => () => {
      void sprite.current?.then((bitmap) => bitmap.close()).catch(() => {});
    },
    [],
  );

  async function pick(index: number) {
    setWorking(index);
    setError('');
    try {
      sprite.current ??= loadSprite(clip.spriteUrl);
      const blob = await cutFrame(await sprite.current, frames, index);
      const url = await uploadFile(blob, encodedFilename(`${baseName(clip.videoUrl)}-poster.webp`, blob.type), 'posters');
      const result = await setVideoPoster(clip.id, url);
      if (result.error) throw new Error(result.error);
      setPicked(index);
    } catch (cause) {
      // A failed fetch is worth retrying from scratch, not from the same rejection.
      sprite.current = null;
      setError(cause instanceof Error ? cause.message : 'Could not set the thumbnail');
    } finally {
      setWorking(null);
    }
  }

  // Wrapped in two rows past ten, so eighteen frames are still big enough to tell apart.
  const columns = frames <= 10 ? frames : Math.ceil(frames / 2);

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL}>Thumbnail — pick a frame</span>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: frames }, (_, index) => {
          const on = picked === index;
          return (
            <button
              key={index}
              type="button"
              aria-label={`Use frame ${index + 1} as the thumbnail`}
              aria-pressed={on}
              disabled={working !== null}
              onClick={() => void pick(index)}
              style={{
                aspectRatio: clip.width && clip.height ? `${clip.width} / ${clip.height}` : '16 / 9',
                backgroundImage: `url(${clip.spriteUrl})`,
                backgroundSize: `${frames * 100}% 100%`,
                backgroundPosition: frames > 1 ? `${(index / (frames - 1)) * 100}% 0` : '0 0',
              }}
              className={`rounded-[2px] bg-black outline-2 outline-offset-1 transition ${
                on ? 'outline-gold' : 'opacity-75 outline-transparent hover:opacity-100'
              } ${working === index ? 'animate-pulse' : ''} disabled:cursor-wait`}
            />
          );
        })}
      </div>
      {error ? (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      ) : (
        <span className="text-xs text-ash">
          {working !== null
            ? 'Setting the thumbnail…'
            : picked !== null
              ? `Frame ${picked + 1} is the thumbnail.`
              : cover
                ? 'Showing a picked image. A frame here replaces it.'
                : 'From the scrub preview.'}
        </span>
      )}
    </div>
  );
}

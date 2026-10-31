'use client';

import { useEffect, useRef, useState } from 'react';
import { LABEL } from '../fields';
import { useObjectUrl } from '../useObjectUrl';
import type { ClipItem } from './AddQueue';

/** Sized for a panel inside a queue row, not a form of its own. */
const SMALL = 'h-8 rounded-md border border-gold px-3 text-xs text-gold transition hover:bg-gold/10 disabled:opacity-40';
const QUIET = 'text-xs text-ash transition hover:text-bone disabled:opacity-50';

/**
 * A queued clip's preview, as the one-at-a-time form had it: a scrubber to find
 * where the frames should come from, the frame strip, and a hand-picked
 * thumbnail to stand in for the first frame. All of it works on the copy kept
 * in this browser, so nothing is uploaded until Publish.
 *
 * The frames are a short window, not the whole clip — spread across minutes
 * they read as a slideshow — and where it opens is a guess a fifth of the way
 * in. This is that guess handed to whoever has watched the clip.
 */
export function ClipPreview({
  item,
  source,
  onRegrab,
  onCover,
}: {
  item: ClipItem;
  source: { file: File; sprite: Blob };
  onRegrab: (startSeconds: number) => Promise<string | null>;
  onCover: (picked: File | null) => Promise<string | null>;
}) {
  const span = item.window ?? { start: 0, seconds: 0 };
  const [at, setAt] = useState(span.start);
  const [busy, setBusy] = useState<'' | 'frames' | 'cover'>('');
  const [error, setError] = useState('');
  const scrubber = useRef<HTMLVideoElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const clipUrl = useObjectUrl(source.file);
  const stripUrl = useObjectUrl(source.sprite);

  // Parks the scrubber on the window's first frame. Driven off the slider
  // rather than played, so finding a window is one seek, not a fresh grab.
  useEffect(() => {
    const video = scrubber.current;
    if (video && video.readyState >= 1) video.currentTime = at;
  }, [at]);

  const latest = Math.max(0, item.durationSeconds - span.seconds);
  const moved = Math.abs(at - span.start) >= 0.05;

  async function run(kind: 'frames' | 'cover', work: () => Promise<string | null>) {
    setBusy(kind);
    setError('');
    const problem = await work();
    setBusy('');
    if (problem) setError(problem);
  }

  return (
    <section className="grid gap-4 rounded-md border border-hairline bg-frame p-3 md:grid-cols-[240px_minmax(0,1fr)]">
      {latest > 0 ? (
        <div className="flex w-full max-w-60 flex-col gap-2">
          {/* No controls: the slider is this video's transport, so the picture
              and the window can never disagree about where they are. */}
          <video
            ref={scrubber}
            src={clipUrl || undefined}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = at;
            }}
            // Sized inline as well as by class, so the box stays small even on
            // a stylesheet that predates these classes.
            style={{ aspectRatio: `${item.width || 16} / ${item.height || 9}`, width: '100%', maxWidth: 240, maxHeight: 135 }}
            className="rounded bg-black object-contain"
          />
          <input
            type="range"
            min={0}
            max={latest}
            step={0.1}
            value={Math.min(at, latest)}
            disabled={busy !== ''}
            onChange={(event) => setAt(Number(event.target.value))}
            aria-label="Where the preview frames start"
            className="h-4 w-full accent-gold"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-ash tabular-nums">
              {at.toFixed(1)}s – {(at + span.seconds).toFixed(1)}s
            </span>
            <button
              type="button"
              onClick={() => run('frames', () => onRegrab(at))}
              disabled={busy !== '' || !moved}
              className={SMALL}
            >
              {busy === 'frames' ? 'Grabbing…' : moved ? 'Grab from here' : 'Frames are from here'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={LABEL}>Frames</span>
            <span className="font-mono text-[11px] text-ash tabular-nums">
              {span.start.toFixed(1)}s – {(span.start + span.seconds).toFixed(1)}s of {item.durationSeconds.toFixed(1)}s
            </span>
          </div>
          {stripUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stripUrl} alt="" draggable={false} className="w-full rounded" />
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {item.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumb} alt="" draggable={false} className="h-12 w-20 shrink-0 rounded object-cover" />
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            <span className={LABEL}>Thumbnail</span>
            <span className="text-xs text-ash">
              {item.hasCover ? 'A picked image, shown before the clip plays.' : 'The first frame. Pick an image to use instead.'}
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {item.hasCover ? (
              <button type="button" onClick={() => run('cover', () => onCover(null))} disabled={busy !== ''} className={QUIET}>
                Use first frame
              </button>
            ) : null}
            <button type="button" onClick={() => coverInput.current?.click()} disabled={busy !== ''} className={SMALL}>
              {busy === 'cover' ? 'Preparing…' : item.hasCover ? 'Replace' : 'Pick image'}
            </button>
          </div>
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = '';
              if (picked) void run('cover', () => onCover(picked));
            }}
          />
        </div>

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </section>
  );
}

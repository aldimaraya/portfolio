'use client';

import { useState } from 'react';
import Link from 'next/link';
import { reorderVideos } from '@/app/admin/videos/actions';

export interface VideoRow {
  id: string;
  title: string;
  description: string;
  posterImageUrl: string;
  spriteFrames: number;
  tags: string[];
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Drag-reorderable wall order. The list is optimistic — rows rearrange on drop
 * and the write happens after, because waiting for a round trip before showing
 * the new position makes dragging feel broken.
 */
/** Identity of the list as rendered by the server, for the sync check below. */
function signatureOf(videos: VideoRow[]): string {
  return videos.map((video) => `${video.id}:${video.title}`).join('|');
}

export function VideoList({ videos }: { videos: VideoRow[] }) {
  const [rows, setRows] = useState(videos);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [status, setStatus] = useState('');

  // useState only reads its argument on mount, so without this the list would
  // keep showing the rows it was first given — a video saved by the form above
  // would not appear until a manual reload. Compared by signature rather than by
  // reference because the parent rebuilds the array on every render, and an
  // identity check would reset the order mid-drag.
  const [syncedTo, setSyncedTo] = useState(() => signatureOf(videos));
  const signature = signatureOf(videos);
  if (signature !== syncedTo) {
    // Setting state during render is the supported way to adjust state when
    // props change; React re-runs this component before touching the DOM.
    setSyncedTo(signature);
    setRows(videos);
  }

  async function persist(next: VideoRow[]) {
    const previous = rows;
    setRows(next);
    setStatus('Saving order…');

    const result = await reorderVideos(next.map((row) => row.id));
    if (result.error) {
      // Put the old order back rather than leaving the screen disagreeing with
      // the database.
      setRows(previous);
      setStatus(result.error);
      return;
    }
    setStatus('Order saved');
  }

  function onDrop(target: number) {
    const from = dragging;
    setDragging(null);
    setOver(null);
    if (from === null || from === target) return;
    void persist(move(rows, from, target));
  }

  /** Keyboard equivalent — drag and drop alone is not reachable without a mouse. */
  function nudge(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    void persist(move(rows, index, target));
  }

  if (rows.length === 0) {
    return <p className="text-sm text-ash">No videos yet.</p>;
  }

  return (
    <>
      <p className="mb-2 text-xs text-ash">
        Drag a row to reorder the wall{status ? ` · ${status}` : ''}
      </p>
      <ul className="flex flex-col divide-y divide-hairline">
        {rows.map((video, index) => (
          <li
            key={video.id}
            draggable
            onDragStart={() => setDragging(index)}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(event) => {
              // Without preventDefault the drop event never fires.
              event.preventDefault();
              setOver(index);
            }}
            onDrop={() => onDrop(index)}
            className={`flex cursor-grab items-center gap-3 py-3 transition ${
              dragging === index ? 'opacity-40' : ''
            } ${over === index && dragging !== index ? 'border-t-2 border-t-gold' : ''}`}
          >
            <span aria-hidden className="font-mono text-xs text-ash select-none">
              ⠿
            </span>
            <span className="w-6 shrink-0 font-mono text-xs text-ash">{index + 1}</span>

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
                  video.description,
                  `${video.spriteFrames} frames`,
                  video.tags.join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>

            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={`Move ${video.title} up`}
                disabled={index === 0}
                onClick={() => nudge(index, -1)}
                className="rounded border border-hairline px-2 text-xs text-ash disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${video.title} down`}
                disabled={index === rows.length - 1}
                onClick={() => nudge(index, 1)}
                className="rounded border border-hairline px-2 text-xs text-ash disabled:opacity-30"
              >
                ↓
              </button>
            </div>

            <Link href={`/admin/videos/${video.id}`} className="shrink-0 text-sm text-gold">
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

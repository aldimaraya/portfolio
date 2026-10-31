'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { reorderSection, setSectionOrder, setSkipped } from '@/app/admin/newsletter/actions';
import { MAX_PHOTO_THUMBNAILS } from '@/lib/newsletter/digest';
import { KIND_LABELS, type ContentKind } from '@/lib/newsletter/kinds';
import { swapSections } from '@/lib/newsletter/layout';
import type { BatchThumb, ItemState } from '@/lib/newsletter/queue';
import { gapAt, isNoop, moveBetween, type Slot } from '@/lib/video/board';
import { Icon } from '../shell/Icon';
import { LocalTime } from './LocalTime';

export interface QueueItem {
  id: string;
  kind: ContentKind;
  title: string;
  /** When it was queued — on publish, so a post's is its publish time. */
  at: string;
  state: ItemState;
  thumb: BatchThumb | null;
  roll: string | null;
}

export interface QueueSection {
  kind: ContentKind;
  items: QueueItem[];
}

const THUMB_HEIGHT = 32;

const MOVE_BUTTON =
  'flex size-8 items-center justify-center rounded-md text-ash transition hover:bg-white/5 hover:text-bone disabled:opacity-30 disabled:hover:bg-transparent';

/**
 * The next email's items, laid out as the email is: one section per kind, in
 * the email's order, each item where it will appear. Drag a row within its
 * section (or ⌥↑ ⌥↓ from its tick box) to move it; the arrows on a section's
 * heading move the whole section. Unticking leaves an item out — of this email
 * and every later one, since an item is only ever queued once — and ticking it
 * again under "Left out earlier" puts it back.
 */
export function BatchQueue({
  sections,
  order,
  skipped,
}: {
  /** The sections with something in them, in the email's order. */
  sections: QueueSection[];
  /** Every kind, in the email's order — what a section move rewrites. */
  order: ContentKind[];
  skipped: QueueItem[];
}) {
  const router = useRouter();
  const [lists, setLists] = useState(sections);
  const [dragging, setDragging] = useState<Slot | null>(null);
  const [over, setOver] = useState<Slot | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();
  // Ticks flip at once; the refresh that lands with the transition moves the
  // row to the other list, and the override falls away with it.
  const [overrides, setOverride] = useOptimistic(
    new Map<string, boolean>(),
    (current, [id, included]: [string, boolean]) => new Map(current).set(id, included),
  );

  // As on the Motion board: the server's fresh lists are taken in by content,
  // not identity, so a refresh mid-drag does not reset the order under the pointer.
  const signature = JSON.stringify(sections);
  const [syncedTo, setSyncedTo] = useState(signature);
  if (signature !== syncedTo) {
    setSyncedTo(signature);
    setLists(sections);
  }

  /** Runs a save, then refreshes so the preview shows what was saved. */
  function save(action: () => Promise<{ error?: string }>, undo?: () => void) {
    setError('');
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        undo?.();
      }
      router.refresh();
    });
  }

  function toggle(item: QueueItem, included: boolean) {
    setError('');
    startTransition(async () => {
      setOverride([item.id, included]);
      const result = await setSkipped(item.id, !included);
      if (result.error) setError(`${item.title || 'Untitled'}: ${result.error}`);
      router.refresh();
    });
  }

  function move(from: Slot, to: Slot) {
    if (from.group !== to.group || isNoop(from, to)) return;
    const before = lists;
    const moved = moveBetween(
      lists.map((section) => section.items),
      from,
      to,
    );
    const next = lists.map((section, i) => ({ ...section, items: moved[i] }));
    setLists(next);
    const section = next[from.group];
    save(
      () =>
        reorderSection(
          section.kind,
          section.items.map((item) => item.id),
        ),
      () => setLists(before),
    );
  }

  function moveSectionBy(group: number, delta: -1 | 1) {
    const neighbour = lists[group + delta];
    if (!neighbour) return;
    const before = lists;
    const next = [...lists];
    [next[group], next[group + delta]] = [next[group + delta], next[group]];
    setLists(next);
    save(
      () => setSectionOrder(swapSections(order, lists[group].kind, neighbour.kind)),
      () => setLists(before),
    );
  }

  function endDrag() {
    setDragging(null);
    setOver(null);
  }

  /** Where a row sits relative to the pending drop, for the gold insertion line. */
  function marker(group: number, index: number, last: boolean) {
    if (!over || !dragging || over.group !== group || isNoop(dragging, over)) return '';
    if (over.index === index) return 'shadow-[inset_0_3px_0_var(--color-gold)]';
    if (last && over.index === index + 1) return 'shadow-[inset_0_-3px_0_var(--color-gold)]';
    return '';
  }

  const included = (item: QueueItem) => overrides.get(item.id) ?? true;

  return (
    <>
      {lists.length ? (
        <div className="flex flex-col">
          {lists.map((section, group) => {
            // Only the first few stills get a thumbnail; the rest are counted in
            // the "See all" link. Ranked among what will actually go.
            let shownStills = 0;
            return (
              <section key={section.kind} aria-label={KIND_LABELS[section.kind].label}>
                <div className="flex h-10 items-center gap-2 border-b border-white/6 bg-white/[0.02] pr-2 pl-4 md:pl-5">
                  <h3 className="font-mono text-[10px] tracking-[0.15em] text-ash uppercase">
                    {KIND_LABELS[section.kind].label} · {section.items.length}
                  </h3>
                  {lists.length > 1 ? (
                    <span className="ml-auto flex">
                      <button
                        type="button"
                        aria-label={`Move ${KIND_LABELS[section.kind].label} up`}
                        disabled={group === 0}
                        onClick={() => moveSectionBy(group, -1)}
                        className={MOVE_BUTTON}
                      >
                        <Arrow up />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${KIND_LABELS[section.kind].label} down`}
                        disabled={group === lists.length - 1}
                        onClick={() => moveSectionBy(group, 1)}
                        className={MOVE_BUTTON}
                      >
                        <Arrow />
                      </button>
                    </span>
                  ) : null}
                </div>
                <ul
                  onDragOver={(event) => {
                    // The list's own space below its rows means its end.
                    if (dragging?.group !== group) return;
                    event.preventDefault();
                    const slot = { group, index: section.items.length };
                    if (over?.group !== slot.group || over.index !== slot.index) setOver(slot);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) move(dragging, { group, index: section.items.length });
                    endDrag();
                  }}
                >
                  {section.items.map((item, index) => {
                    const counted =
                      section.kind === 'stills' && item.state === 'live' && included(item) && ++shownStills > MAX_PHOTO_THUMBNAILS;
                    return (
                      <QueueRow
                        key={item.id}
                        item={item}
                        included={included(item)}
                        counted={counted}
                        draggable={section.items.length > 1}
                        dimmed={dragging?.group === group && dragging.index === index}
                        marker={marker(group, index, index === section.items.length - 1)}
                        first={index === 0}
                        last={index === section.items.length - 1}
                        onToggle={toggle}
                        onNudge={(delta) => move({ group, index }, { group, index: delta < 0 ? index - 1 : index + 2 })}
                        onDragStart={() => setDragging({ group, index })}
                        onDragEnd={endDrag}
                        onDragOver={(event) => {
                          // Rows in another section refuse the drop: order is per section.
                          if (dragging?.group !== group) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          const slot = { group, index: gapAt(index, event.clientY, rect.top, rect.height) };
                          if (over?.group !== slot.group || over.index !== slot.index) setOver(slot);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          if (dragging) move(dragging, { group, index: gapAt(index, event.clientY, rect.top, rect.height) });
                          endDrag();
                        }}
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {showSkipped && skipped.length ? (
        <section aria-label="Left out earlier">
          <h3 className="flex h-10 items-center border-b border-white/6 bg-white/[0.02] px-4 font-mono text-[10px] tracking-[0.15em] text-ash uppercase md:px-5">
            Left out · {skipped.length}
          </h3>
          <ul>
            {skipped.map((item) => (
              <QueueRow key={item.id} item={item} included={overrides.get(item.id) ?? false} onToggle={toggle} />
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="px-4 pt-3 text-sm text-red-400 md:px-5">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-4 text-xs text-ash md:px-5">
        {lists.length ? (
          <span>
            Untick to leave something out.
            <span className="max-md:hidden"> Drag a row, or ⌥↑ ⌥↓ from its tick box, to move it in its section.</span>
          </span>
        ) : null}
        {skipped.length ? (
          <button
            type="button"
            aria-expanded={showSkipped}
            onClick={() => setShowSkipped(!showSkipped)}
            className="ml-auto h-8 rounded-md border border-white/15 px-2.5 text-xs text-[#d0d0d4] transition hover:border-white/40"
          >
            {showSkipped ? 'Hide left out' : `Left out earlier · ${skipped.length}`}
          </button>
        ) : null}
      </div>
    </>
  );
}

function QueueRow({
  item,
  included,
  counted = false,
  draggable = false,
  dimmed = false,
  marker = '',
  first = true,
  last = true,
  onToggle,
  onNudge,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: QueueItem;
  included: boolean;
  /** A still past the thumbnail limit: in the email's count, not its grid. */
  counted?: boolean;
  draggable?: boolean;
  dimmed?: boolean;
  marker?: string;
  first?: boolean;
  last?: boolean;
  onToggle: (item: QueueItem, included: boolean) => void;
  onNudge?: (delta: -1 | 1) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLLIElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLLIElement>) => void;
}) {
  const inputId = `queue-${item.id}`;
  const missing = item.state === 'missing';
  const movable = draggable && onNudge;
  return (
    <li
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex min-h-13 items-center gap-3 border-b border-white/6 py-2 pr-2 pl-4 last:border-b-0 md:pr-4 md:pl-2 ${
        dimmed ? 'opacity-40' : ''
      } ${draggable ? 'md:cursor-grab' : ''} ${marker}`}
    >
      <span aria-hidden="true" className={`hidden w-3 text-center text-[#5a5a60] select-none md:block ${draggable ? '' : 'invisible'}`}>
        ⠿
      </span>
      {/* Deleted content is dropped by the next run whatever is ticked. */}
      {missing ? (
        <span className="size-4.5 shrink-0" />
      ) : (
        <input
          id={inputId}
          type="checkbox"
          checked={included}
          onChange={(event) => onToggle(item, event.target.checked)}
          onKeyDown={(event) => {
            if (!movable || !event.altKey) return;
            if (event.key === 'ArrowUp' && !first) {
              event.preventDefault();
              onNudge(-1);
            } else if (event.key === 'ArrowDown' && !last) {
              event.preventDefault();
              onNudge(1);
            }
          }}
          className="size-4.5 shrink-0 accent-gold"
        />
      )}
      <Thumb item={item} />
      <label htmlFor={missing ? undefined : inputId} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`truncate text-sm ${included && item.state === 'live' && !counted ? 'text-bone' : 'text-ash'}`}>
          {item.title || 'Untitled'}
        </span>
        <span className={`truncate text-xs ${item.state === 'live' ? 'text-ash' : 'text-amber-400'}`}>
          {item.state === 'held' ? (
            'Back in draft — goes once it is published again'
          ) : missing ? (
            'Deleted — dropped on the next run'
          ) : counted ? (
            `Counted, not shown — the email has room for ${MAX_PHOTO_THUMBNAILS} stills`
          ) : (
            <>
              {item.kind === 'journal' ? 'Published' : 'Added'} <LocalTime value={item.at} />
              {item.roll ? ` · on roll “${item.roll}”` : ''}
            </>
          )}
        </span>
      </label>
      {/* Phones cannot drag a native row, so they get the arrows instead. */}
      {movable ? (
        <span className="flex shrink-0 md:hidden">
          <button
            type="button"
            aria-label={`Move ${item.title || 'Untitled'} up`}
            disabled={first}
            onClick={() => onNudge(-1)}
            className={MOVE_BUTTON}
          >
            <Arrow up />
          </button>
          <button
            type="button"
            aria-label={`Move ${item.title || 'Untitled'} down`}
            disabled={last}
            onClick={() => onNudge(1)}
            className={MOVE_BUTTON}
          >
            <Arrow />
          </button>
        </span>
      ) : null}
    </li>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

/** Shaped like the still or clip it stands for, within a narrow band so rows line up. */
function Thumb({ item }: { item: QueueItem }) {
  const { thumb } = item;
  if (!thumb) {
    return (
      <span
        aria-hidden="true"
        className="flex h-8 w-11 shrink-0 items-center justify-center rounded-xs border border-white/20 text-ash"
      >
        <Icon name="journal" size={14} />
      </span>
    );
  }
  const width = Math.round(Math.min(Math.max((thumb.width / thumb.height) * THUMB_HEIGHT, 22), 58));
  return (
    <span
      aria-hidden="true"
      className="relative shrink-0 overflow-hidden rounded-xs bg-black"
      style={{ width, height: THUMB_HEIGHT, backgroundColor: thumb.color ?? undefined }}
    >
      {item.kind === 'stills' ? (
        <Image src={thumb.url} alt="" fill sizes={`${width}px`} draggable={false} className="object-cover" />
      ) : (
        // Plain <img>, as on the Motion board: a poster thumbnail is not worth an optimisation request.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb.url} alt="" draggable={false} className="size-full object-cover" />
      )}
    </span>
  );
}

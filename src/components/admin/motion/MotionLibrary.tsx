'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { deleteRoll, reorderRolls, reorderVideos, saveRoll } from '@/app/admin/videos/actions';
import { matchesClip, nudgeTarget } from '@/lib/admin/motion';
import { gapAt, isNoop, moveBetween, type Slot } from '@/lib/video/board';
import { formatDuration } from '@/lib/video/duration';
import { CLIP_PARAM } from '@/lib/video/edit-link';
import { NEW_ROLL_ID, NewRoll, RollHeading } from '../RollHeading';
import { AdminPage } from '../shell/AdminPage';
import { Icon } from '../shell/Icon';
import { InspectorDrawer } from '../stills/InspectorDrawer';
import { INSPECTOR_DEFAULT, InspectorResizer, clampInspector } from '../stills/InspectorResizer';
import { useStoredPreference } from '../useStoredPreference';
import { ClipInspector } from './ClipInspector';

export interface Clip {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  posterImageUrl: string;
  spriteUrl: string;
  spriteFrames: number;
  width: number;
  height: number;
  durationSeconds: number;
  youtubeUrl: string;
  /** '' while the clip is on no roll. */
  rollId: string;
  tags: string[];
}

export interface ClipGroup {
  /** Null for clips older than rolls — a place to drag *from*, never *to*. */
  rollId: string | null;
  name: string;
  description: string;
  clips: Clip[];
}

/** Where a clip sits on the board: its list, its row, and the list it is in. */
export interface ClipPlace {
  slot: Slot;
  group: ClipGroup;
}

function sameSlot(a: Slot | null, b: Slot) {
  return a !== null && a.group === b.group && a.index === b.index;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * The Motion page: every roll as a list of clips, one per row, with an
 * inspector beside it that edits the selected one in place. Drag a row along
 * its roll or onto another — or ⌥↑/⌥↓ the selected one — and the order saves
 * on drop. The board is optimistic: rows rearrange at once and the write
 * follows, because waiting a round trip before showing the new position makes
 * dragging feel broken.
 */
export function MotionLibrary({
  groups,
  tagOptions,
  initial,
  returnTo,
}: {
  groups: ClipGroup[];
  tagOptions: string[];
  initial: { query: string; clip: string | null };
  /** The clip page the public Edit link came from; offered as the way back. */
  returnTo: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [lists, setLists] = useState(groups);
  const [dragging, setDragging] = useState<Slot | null>(null);
  const [over, setOver] = useState<Slot | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(initial.query);
  const [selectedId, setSelectedId] = useState(initial.clip);
  // What the drawer shows: the selection, held on through the close animation so
  // the panel slides away with its clip instead of emptying first.
  const [shownId, setShownId] = useState(initial.clip);
  if (selectedId && selectedId !== shownId) setShownId(selectedId);
  const search = useRef<HTMLInputElement>(null);
  const [inspectorPref, setInspectorPref] = useStoredPreference('admin.motion.inspector', String(INSPECTOR_DEFAULT));
  const inspectorWidth = clampInspector(Number(inspectorPref));
  const shell = useRef<HTMLDivElement>(null);

  // useState only reads its argument on mount, so the server's fresh board —
  // after an inspector save revalidates, or a roll is added — has to be taken
  // in by hand. Compared by content rather than by reference because the page
  // rebuilds the array on every render, and an identity check would reset the
  // order mid-drag.
  const signature = JSON.stringify(groups);
  const [syncedTo, setSyncedTo] = useState(signature);
  if (signature !== syncedTo) {
    setSyncedTo(signature);
    setLists(groups);
  }

  const searching = query.trim() !== '';
  const visible = useMemo(
    () => lists.map((group) => group.clips.filter((clip) => matchesClip(clip, group.name, query))),
    [lists, query],
  );
  const order = useMemo(() => visible.flat(), [visible]);
  const clipCount = lists.reduce((sum, group) => sum + group.clips.length, 0);
  const rollCount = lists.filter((group) => group.rollId).length;
  const rolls = lists.flatMap((group) => (group.rollId ? [{ id: group.rollId, name: group.name }] : []));

  function placeOf(id: string | null): ClipPlace | null {
    if (!id) return null;
    for (const [group, entry] of lists.entries()) {
      const index = entry.clips.findIndex((clip) => clip.id === id);
      if (index !== -1) return { slot: { group, index }, group: entry };
    }
    return null;
  }

  const selected = placeOf(selectedId);
  const shown = placeOf(shownId);

  function step(delta: number) {
    if (!order.length) return;
    const index = selectedId ? order.findIndex((clip) => clip.id === selectedId) : -1;
    // From outside the visible set the first step lands on an end.
    const next = index === -1 ? (delta > 0 ? 0 : order.length - 1) : index + delta;
    if (next >= 0 && next < order.length) setSelectedId(order[next].id);
  }

  async function move(from: Slot, to: Slot) {
    const rollId = lists[to.group].rollId;
    // Nowhere to write it: "not on a roll" is a state to leave, not to enter.
    if (!rollId || isNoop(from, to)) return;

    const previous = lists;
    const moved = moveBetween(
      lists.map((group) => group.clips),
      from,
      to,
    );
    const next = lists.map((group, index) => ({
      ...group,
      clips: moved[index].map((clip) => (index === to.group ? { ...clip, rollId } : clip)),
    }));
    setLists(next);
    const crossing = from.group !== to.group;
    setStatus(crossing ? `Moving to ${lists[to.group].name}…` : 'Saving order…');

    // Only the destination is written: see reorderVideos.
    const result = await reorderVideos(
      rollId,
      next[to.group].clips.map((clip) => clip.id),
    );
    if (result.error) {
      // Put the old board back rather than leaving the screen disagreeing with
      // the database.
      setLists(previous);
      setStatus(result.error);
      return;
    }
    setStatus(crossing ? `Moved to ${lists[to.group].name}` : 'Order saved');
  }

  /** Where ⌥↑/⌥↓ would take the selected clip — null where it cannot go, or while a search hides the rows it would pass. */
  function nudgeFor(delta: -1 | 1): Slot | null {
    if (!selected || searching) return null;
    return nudgeTarget(
      lists.map((group) => group.clips.length),
      lists.map((group) => Boolean(group.rollId)),
      selected.slot,
      delta,
    );
  }

  function nudge(delta: -1 | 1) {
    const target = nudgeFor(delta);
    if (selected && target) void move(selected.slot, target);
  }

  /**
   * Roll edits are not optimistic, unlike drags: a rename or a new roll is a
   * single click with nothing to feel sluggish, and waiting for the server's
   * version means the board never shows a roll the database refused.
   */
  async function run(label: string, action: () => Promise<{ error?: string }>) {
    setBusy(true);
    setStatus(`${label}…`);
    const result = await action();
    setBusy(false);
    setStatus(result.error ?? '');
    if (!result.error) router.refresh();
    return !result.error;
  }

  /** Swaps a roll with its neighbour. The unfiled list is never among them. */
  function moveRoll(group: number, delta: -1 | 1) {
    const ids = rolls.map((roll) => roll.id);
    const from = ids.indexOf(lists[group].rollId!);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void run('Saving roll order', () => reorderRolls(ids));
  }

  function endDrag() {
    setDragging(null);
    setOver(null);
  }

  /**
   * Props that make an element a drop target. `gapFor` turns the pointer into
   * the gap it is pointing at: a row asks which half of it the pointer is over,
   * the list itself only ever means its end.
   */
  function dropTarget(group: number, gapFor: (event: React.DragEvent) => number) {
    // No handlers at all on the unfiled list, so the browser shows the drop as
    // refused rather than accepting it and then doing nothing.
    if (!lists[group].rollId) return {};
    return {
      onDragOver: (event: React.DragEvent) => {
        // Without preventDefault the drop event never fires.
        event.preventDefault();
        // Kept off the enclosing list, whose own end gap would otherwise win.
        event.stopPropagation();
        const slot = { group, index: gapFor(event) };
        if (!sameSlot(over, slot)) setOver(slot);
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const from = dragging;
        const to = { group, index: gapFor(event) };
        endDrag();
        if (from) void move(from, to);
      },
    };
  }

  /** Where a row sits relative to the pending drop, for the gold insertion line. */
  function marker(group: number, index: number, last: boolean) {
    if (!over || !dragging || over.group !== group || isNoop(dragging, over)) return '';
    // Box shadows rather than borders, so the line appears without shifting
    // every row under the pointer mid-drag.
    if (over.index === index) return 'shadow-[inset_0_3px_0_var(--color-gold)]';
    if (last && over.index === index + 1) return 'shadow-[inset_0_-3px_0_var(--color-gold)]';
    return '';
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string | null) => (value ? params.set(key, value) : params.delete(key));
    set('q', query.trim() || null);
    set(CLIP_PARAM, selectedId);
    const next = params.toString();
    // The hash is kept: it is what opens the new-roll form.
    window.history.replaceState(null, '', (next ? `${pathname}?${next}` : pathname) + window.location.hash);
  }, [pathname, query, selectedId]);

  // Effect events, so the listener is attached once yet always acts on the
  // current board.
  const onStep = useEffectEvent(step);
  const onNudge = useEffectEvent(nudge);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // defaultPrevented: a control that already took the key — an open roll
      // dropdown's arrows — must not also step the board underneath it.
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || isTyping(event.target)) return;
      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if (vertical) {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        if (event.altKey) onNudge(delta);
        else onStep(delta);
      } else if (event.altKey) {
        return;
      } else if (event.key === '/') {
        event.preventDefault();
        search.current?.focus();
      } else if (event.key === 'Escape') {
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keep the selected row in view as ↑/↓ walks past the fold, and as ⌥↑/⌥↓
  // carries it onto another roll.
  const selectedSlot = selected ? `${selected.slot.group}:${selected.slot.index}` : '';
  useEffect(() => {
    if (!selectedId) return;
    document.querySelector(`[data-clip="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, selectedSlot]);

  return (
    <div ref={shell} className="lg:flex" style={{ '--inspector-w': `${inspectorWidth}px` } as React.CSSProperties}>
      <div className="min-w-0 flex-1">
        <AdminPage
          title="Motion"
          count={
            <>
              {clipCount} {clipCount === 1 ? 'clip' : 'clips'}
              <span className="hidden md:inline">
                {' '}
                · {rollCount} {rollCount === 1 ? 'roll' : 'rolls'}
              </span>
            </>
          }
          bleed
          actions={
            <>
              <label className="flex h-9 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-hairline bg-film px-3 text-ash md:max-w-80">
                <Icon name="search" size={15} />
                <span className="sr-only">Search clips</span>
                <input
                  ref={search}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
                  placeholder="Search title, tag, roll…"
                  className="min-w-0 flex-1 bg-transparent text-bone outline-none placeholder:text-ash"
                />
                <kbd className="hidden font-mono text-[11px] md:inline">/</kbd>
              </label>
              <a
                href={`#${NEW_ROLL_ID}`}
                className="flex h-9 items-center rounded-lg border border-white/15 px-3.5 text-sm transition hover:border-white/40 md:ml-auto"
              >
                + New roll
              </a>
            </>
          }
        >
          <div className="flex flex-col gap-8 px-4 pt-5 pb-8 md:px-6">
            {lists.length === 0 ? <p className="py-10 text-center text-sm text-ash">No rolls or clips yet.</p> : null}
            {searching && !order.length ? <p className="py-10 text-center text-sm text-ash">Nothing matches.</p> : null}

            {lists.map((group, groupIndex) => {
              const rows = visible[groupIndex];
              // A search hides the rolls it found nothing on, but never the
              // whole board: an empty roll is still somewhere to drop.
              if (searching && !rows.length) return null;
              const length = group.clips.length;
              const unfiled = !group.rollId;
              const crossing = dragging !== null && dragging.group !== groupIndex && !unfiled;

              return (
                <section
                  key={group.rollId ?? 'unfiled'}
                  className={unfiled ? 'rounded-[10px] border border-dashed border-[#e0a050]/55 p-3' : ''}
                >
                  {unfiled ? (
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
                      <h2 className="text-sm text-[#e0a050]">
                        Not on a roll <span className="font-mono text-xs text-ash">({length})</span>
                      </h2>
                      <span className="text-xs text-ash">
                        /motion shows {length === 1 ? 'it' : 'them'} under the first roll. Drag onto one below, or
                        pick a roll in the inspector.
                      </span>
                    </div>
                  ) : (
                    <RollHeading
                      name={group.name}
                      description={group.description}
                      count={length}
                      first={group.rollId === rolls[0]?.id}
                      last={group.rollId === rolls.at(-1)?.id}
                      busy={busy}
                      onSave={(draft) => run('Saving roll', () => saveRoll({ id: group.rollId!, ...draft }))}
                      onMove={(delta) => moveRoll(groupIndex, delta)}
                      onDelete={() => void run('Deleting roll', () => deleteRoll(group.rollId!))}
                    />
                  )}

                  {/* The whole list is a target for its own end slot, so a drop in
                      the gap under the last row — or anywhere on an empty roll —
                      lands. */}
                  <ul
                    {...dropTarget(groupIndex, () => length)}
                    className={`flex flex-col overflow-hidden rounded-lg border transition ${
                      crossing && over?.group === groupIndex
                        ? 'border-gold'
                        : crossing
                          ? 'border-dashed border-white/25'
                          : 'border-white/8'
                    }`}
                  >
                    {rows.map((clip) => {
                      const index = group.clips.indexOf(clip);
                      const slot = { group: groupIndex, index };
                      return (
                        <ClipRow
                          key={clip.id}
                          clip={clip}
                          number={index + 1}
                          selected={clip.id === selectedId}
                          draggable={!searching}
                          dimmed={sameSlot(dragging, slot)}
                          marker={marker(groupIndex, index, index === length - 1)}
                          onSelect={() => setSelectedId(clip.id)}
                          onDragStart={() => setDragging(slot)}
                          onDragEnd={endDrag}
                          dropProps={dropTarget(groupIndex, (event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            return gapAt(index, event.clientY, box.top, box.height);
                          })}
                        />
                      );
                    })}

                    {length === 0 ? (
                      <li className="px-4 py-4 text-xs text-ash">
                        {crossing ? 'Drop here to move it onto this roll' : 'No clips on this roll yet.'}
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}

            <NewRoll
              busy={busy}
              startOpen={!rolls.length}
              onAdd={(draft) => run('Adding roll', () => saveRoll(draft))}
            />

            <p className="hidden text-xs text-ash md:block">
              Drag a row to reorder its roll, or onto another · ↑ ↓ steps through · ⌥↑ ⌥↓ moves the selected clip · /
              searches · Esc closes
              {status ? <span className="text-bone"> · {status}</span> : null}
            </p>
            {status ? (
              <p role="status" className="text-xs text-bone md:hidden">
                {status}
              </p>
            ) : null}
          </div>
        </AdminPage>
      </div>

      {selected ? (
        <InspectorResizer target={shell} width={inspectorWidth} onCommit={(width) => setInspectorPref(String(width))} />
      ) : null}

      <InspectorDrawer open={selected !== null} onClose={() => setSelectedId(null)} onClosed={() => setShownId(null)}>
        {shown ? (
          <ClipInspector
            key={shown.group.clips[shown.slot.index].id}
            clip={shown.group.clips[shown.slot.index]}
            place={shown}
            rolls={rolls}
            tagOptions={tagOptions}
            // Only for the clip the public page sent; another one has its own page.
            returnTo={shownId === initial.clip ? returnTo : null}
            canNudge={{ up: nudgeFor(-1) !== null, down: nudgeFor(1) !== null }}
            onNudge={nudge}
            onStep={step}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </InspectorDrawer>
    </div>
  );
}

function ClipRow({
  clip,
  number,
  selected,
  draggable,
  dimmed,
  marker,
  onSelect,
  onDragStart,
  onDragEnd,
  dropProps,
}: {
  clip: Clip;
  number: number;
  selected: boolean;
  draggable: boolean;
  dimmed: boolean;
  marker: string;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dropProps: React.HTMLAttributes<HTMLLIElement>;
}) {
  const duration = formatDuration(clip.durationSeconds);
  const detail = clip.tags.length ? clip.tags.join(' · ') : clip.description;
  return (
    <li
      data-clip={clip.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...dropProps}
      className={`border-t border-white/6 first:border-t-0 transition-opacity ${dimmed ? 'opacity-40' : ''} ${marker}`}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`grid min-h-[70px] w-full grid-cols-[20px_80px_minmax(0,1fr)_auto] items-center gap-3 py-2 pr-4 pl-3 text-left transition-colors md:grid-cols-[14px_20px_96px_minmax(0,1fr)_auto] md:gap-3.5 ${
          selected ? 'bg-gold/8 shadow-[inset_3px_0_0_var(--color-gold)]' : 'bg-[#111113] hover:bg-white/3'
        } ${draggable ? 'md:cursor-grab' : ''}`}
      >
        <span aria-hidden="true" className="hidden text-[#5a5a60] select-none md:block">
          ⠿
        </span>
        <span className="text-right font-mono text-[11px] text-ash tabular-nums">{number}</span>
        {/* Plain <img>: a small admin thumbnail, not worth an optimisation request each. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={clip.posterImageUrl}
          alt=""
          draggable={false}
          className="aspect-video w-full rounded-[3px] bg-black object-cover"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`truncate text-sm ${selected ? 'text-gold' : 'text-bone'}`}>{clip.title}</span>
          {detail ? <span className="truncate text-xs text-ash">{detail}</span> : null}
        </span>
        <span className="font-mono text-xs text-[#b4b4ba] tabular-nums">{duration ?? ''}</span>
      </button>
    </li>
  );
}

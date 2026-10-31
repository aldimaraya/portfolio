'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { placeholderColor } from '@/lib/color/analyze';
import {
  DEFAULT_ORDER,
  FILTER_LABELS,
  ORDER_LABELS,
  matchesFilter,
  orderStills,
  selectStills,
  type LibraryPhoto,
  type StillsFilter,
  type StillsOrder,
} from '@/lib/admin/stills';
import type { PhotoSettings } from '@/lib/photo/settings';
import { AdminPage } from '../shell/AdminPage';
import { Icon } from '../shell/Icon';
import { useStoredPreference } from '../useStoredPreference';
import { InspectorDrawer } from './InspectorDrawer';
import { INSPECTOR_DEFAULT, InspectorResizer, clampInspector } from './InspectorResizer';
import { StillInspector } from './StillInspector';

export interface Still extends LibraryPhoto {
  imageUrl: string;
  width: number;
  height: number;
  settings: PhotoSettings;
  avgHue: number;
  avgChroma: number;
}

export interface LibraryState {
  filter: StillsFilter;
  order: StillsOrder;
  query: string;
  photo: string | null;
}

/** Thumbnail row heights the size slider moves between, in px. */
const SIZE_MIN = 64;
const SIZE_MAX = 240;
const SIZE_DEFAULT = 104;

/** Filters that point at work to do get their count, in amber, when there is any. */
const FIXABLE: StillsFilter[] = ['undated', 'untagged', 'untitled'];

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * The Stills page: every photo as a justified grid, with an inspector beside it
 * that edits the selected one in place. Filter, order, search and selection all
 * live in the query string, so a refresh — or the back button from the full
 * edit form — lands on the same view.
 */
export function StillsLibrary({
  photos,
  tagOptions,
  locationOptions,
  initial,
  returnTo,
}: {
  photos: Still[];
  tagOptions: string[];
  locationOptions: string[];
  initial: LibraryState;
  /** Where the public wall's Edit link came from; offered as the way back. */
  returnTo: string | null;
}) {
  const pathname = usePathname();
  const [filter, setFilter] = useState(initial.filter);
  const [order, setOrder] = useState(initial.order);
  const [query, setQuery] = useState(initial.query);
  const [selectedId, setSelectedId] = useState(initial.photo);
  // What the drawer shows: the selection, held on through the close animation so
  // the panel slides away with its photo instead of emptying first.
  const [shownId, setShownId] = useState(initial.photo);
  if (selectedId && selectedId !== shownId) setShownId(selectedId);
  // Fixed for the life of the page, so "this week" does not shift under a render.
  const [now] = useState(() => Date.now());
  const search = useRef<HTMLInputElement>(null);
  const [sizePref, setSizePref] = useStoredPreference('admin.stills.size', String(SIZE_DEFAULT));
  const [titlesPref, setTitlesPref] = useStoredPreference('admin.stills.titles', 'on');
  const rowHeight = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(sizePref) || SIZE_DEFAULT));
  const showTitles = titlesPref === 'on';
  const [inspectorPref, setInspectorPref] = useStoredPreference('admin.stills.inspector', String(INSPECTOR_DEFAULT));
  const inspectorWidth = clampInspector(Number(inspectorPref));
  const shell = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => selectStills(photos, { filter, order, query, now }), [photos, filter, order, query, now]);
  const wall = useMemo(() => orderStills(photos, 'wall'), [photos]);
  const counts = useMemo(() => {
    const result = {} as Record<StillsFilter, number>;
    for (const key of Object.keys(FILTER_LABELS) as StillsFilter[]) {
      result[key] = photos.filter((photo) => matchesFilter(photo, key, now)).length;
    }
    return result;
  }, [photos, now]);

  const selected = photos.find((photo) => photo.id === selectedId) ?? null;
  const shown = photos.find((photo) => photo.id === shownId) ?? null;
  const index = selected ? visible.findIndex((photo) => photo.id === selected.id) : -1;
  const shownIndex = shown ? visible.findIndex((photo) => photo.id === shown.id) : -1;

  function step(delta: number) {
    if (!visible.length) return;
    // From outside the visible set (nothing picked, or the pick was filtered
    // away) the first step lands on an end rather than doing nothing.
    const next = index === -1 ? (delta > 0 ? 0 : visible.length - 1) : index + delta;
    if (next >= 0 && next < visible.length) setSelectedId(visible[next].id);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string | null) => (value ? params.set(key, value) : params.delete(key));
    set('filter', filter === 'all' ? null : filter);
    set('order', order === DEFAULT_ORDER ? null : order);
    set('q', query.trim() || null);
    set('photo', selectedId);
    const next = params.toString();
    window.history.replaceState(null, '', next ? `${pathname}?${next}` : pathname);
  }, [pathname, filter, order, query, selectedId]);

  // An effect event, so the listener is attached once yet always steps through
  // the current visible set.
  const onStep = useEffectEvent(step);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        onStep(event.key === 'ArrowRight' ? 1 : -1);
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

  // Keep the selected tile in view as ←/→ walks past the fold.
  useEffect(() => {
    if (!selectedId) return;
    document.querySelector(`[data-still="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div ref={shell} className="lg:flex" style={{ '--inspector-w': `${inspectorWidth}px` } as React.CSSProperties}>
      <div className="min-w-0 flex-1">
        <AdminPage
          title="Stills"
          count={photos.length}
          bleed
          actions={
            <>
              <label className="flex h-9 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-hairline bg-film px-3 text-ash md:max-w-90">
                <Icon name="search" size={15} />
                <span className="sr-only">Search stills</span>
                <input
                  ref={search}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
                  placeholder="Search title, place, camera, tag…"
                  className="min-w-0 flex-1 bg-transparent text-bone outline-none placeholder:text-ash"
                />
                <kbd className="hidden font-mono text-[11px] md:inline">/</kbd>
              </label>
              <div role="group" aria-label="Order" className="flex gap-1 rounded-lg border border-hairline bg-film p-[3px] md:ml-auto">
                {(Object.keys(ORDER_LABELS) as StillsOrder[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={order === option}
                    onClick={() => setOrder(option)}
                    className={`h-7 rounded-md px-2.5 text-xs transition-colors ${order === option ? 'bg-frame text-bone' : 'text-ash hover:text-bone'}`}
                  >
                    {ORDER_LABELS[option]}
                  </button>
                ))}
              </div>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-hairline px-4 py-3 md:px-6">
            <div className="-mx-4 flex min-w-0 flex-[1_1_100%] gap-2 overflow-x-auto px-4 md:mx-0 md:flex-[1_1_auto] md:flex-wrap md:px-0">
              {(Object.keys(FILTER_LABELS) as StillsFilter[]).map((option) => {
                const on = filter === option;
                const fixable = FIXABLE.includes(option) && counts[option] > 0;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(on ? 'all' : option)}
                    className={`h-8 shrink-0 rounded-full border px-3 text-xs transition ${
                      on ? 'border-gold bg-gold/10 text-gold' : 'border-white/15 text-[#d0d0d4] hover:border-white/40'
                    }`}
                  >
                    {FILTER_LABELS[option]}
                    {option !== 'all' && (fixable || on) ? (
                      <span className={`ml-1.5 ${fixable ? 'text-amber-400' : ''}`}>{counts[option]}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 md:ml-auto">
              <button
                type="button"
                aria-pressed={showTitles}
                onClick={() => setTitlesPref(showTitles ? 'off' : 'on')}
                className={`h-8 rounded-full border px-3 text-xs transition ${
                  showTitles ? 'border-gold bg-gold/10 text-gold' : 'border-white/15 text-[#d0d0d4] hover:border-white/40'
                }`}
              >
                Titles
              </button>
              <label className="flex items-center gap-2 text-ash">
                <Icon name="stills" size={12} />
                <span className="sr-only">Thumbnail size</span>
                <input
                  type="range"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  step={8}
                  value={rowHeight}
                  onChange={(event) => setSizePref(event.target.value)}
                  className="w-28 accent-gold"
                />
                <Icon name="stills" size={18} />
              </label>
            </div>
          </div>

          <div className="px-4 pt-4 pb-6 md:px-6">
            {visible.length ? (
              <div
                className={`flex flex-wrap md:gap-x-1.5 ${showTitles ? 'gap-x-1 gap-y-3 md:gap-y-4' : 'gap-1 md:gap-y-1.5'}`}
                style={{ '--h': `${rowHeight}px` } as React.CSSProperties}
              >
                {visible.map((photo) => (
                  <Tile
                    key={photo.id}
                    photo={photo}
                    rowHeight={rowHeight}
                    showTitle={showTitles}
                    selected={photo.id === selectedId}
                    onSelect={() => setSelectedId(photo.id)}
                  />
                ))}
                {/* Soaks up the last row's slack, so its tiles keep their ratio instead of stretching to the edge. */}
                <span aria-hidden="true" className="h-0 flex-[999_1_0]" />
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-ash">
                {photos.length ? 'Nothing matches.' : 'No photos yet — Add media puts the first one here.'}
              </p>
            )}
            <p className="mt-4 hidden text-xs text-ash md:block">Click to inspect · ← → steps through · / searches · Esc closes</p>
          </div>
        </AdminPage>
      </div>

      {selected ? (
        <InspectorResizer target={shell} width={inspectorWidth} onCommit={(width) => setInspectorPref(String(width))} />
      ) : null}

      <InspectorDrawer open={selected !== null} onClose={() => setSelectedId(null)} onClosed={() => setShownId(null)}>
        {shown ? (
          <StillInspector
            width={inspectorWidth}
            key={shown.id}
            photo={shown}
            library={photos}
            wallIndex={wall.findIndex((photo) => photo.id === shown.id)}
            position={shownIndex === -1 ? null : { index: shownIndex, total: visible.length }}
            // Only for the photo the wall sent; another one has its own wall link.
            returnTo={shown.id === initial.photo ? returnTo : null}
            tagOptions={tagOptions}
            locationOptions={locationOptions}
            onStep={step}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </InspectorDrawer>
    </div>
  );
}

function Tile({
  photo,
  rowHeight,
  showTitle,
  selected,
  onSelect,
}: {
  photo: Still;
  rowHeight: number;
  showTitle: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const ratio = photo.width / photo.height;
  const label = photo.title || photo.location;
  return (
    <button
      type="button"
      data-still={photo.id}
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
      // Width grows from the photo's own ratio at the row height (--h, set by
      // the size slider), so a row packs like the wall does without measuring.
      style={{ '--r': ratio } as React.CSSProperties}
      className={`group flex min-w-0 grow-[var(--r)] basis-[calc(var(--r)*var(--h))] flex-col gap-1.5 rounded-[3px] text-left outline-2 outline-offset-2 transition-[outline-color,scale] duration-200 active:scale-[0.98] motion-reduce:transition-none ${
        selected ? 'outline-gold' : 'outline-transparent'
      }`}
    >
      <span
        className="relative block h-(--h) w-full overflow-hidden rounded-[3px] transition-[filter] duration-200 group-hover:brightness-110"
        style={{ backgroundColor: placeholderColor(photo) }}
      >
        {/* Small sizes on purpose: the wall's own frames are this size, so these
            mostly reuse transformations the public site already paid for. */}
        <Image src={photo.imageUrl} alt="" fill sizes={`${Math.ceil(ratio * rowHeight * 1.3)}px`} className="object-cover" />
      </span>
      {showTitle ? (
        // The wall's caption heading — title when there is one, else the place —
        // with the place kept underneath once a title has taken its spot.
        <span className="flex min-w-0 flex-col px-0.5 leading-tight">
          <span className={`truncate text-[11px] font-semibold tracking-[0.04em] uppercase transition-colors ${selected ? 'text-gold' : ''}`}>
            {label || 'Untitled'}
          </span>
          {photo.title ? <span className="truncate font-mono text-[10px] text-ash">{photo.location}</span> : null}
        </span>
      ) : null}
    </button>
  );
}

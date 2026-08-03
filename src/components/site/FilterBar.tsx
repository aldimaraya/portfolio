'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  serializeFilters,
  type MediaFilters,
} from '@/lib/filters/parse';
import type { FilterOptions } from '@/lib/filters/apply';
import {
  DEFAULT_SORT,
  randomSeed,
  SORT_LABELS,
  SORT_ORDER,
  type WallSort,
} from '@/lib/color/sort';

interface Props {
  options: FilterOptions;
  active: MediaFilters;
  sort: WallSort;
  seed: number;
}

type FilterKey = keyof MediaFilters;

const GROUPS: { key: FilterKey; label: string }[] = [
  { key: 'cameras', label: 'Camera' },
  { key: 'locations', label: 'Location' },
  { key: 'tags', label: 'Tag' },
];

/**
 * Filter and sort state live in the URL, not in component state, so a narrowed
 * wall is a shareable link and the back button steps through the changes.
 *
 * The URL is updated through the History API rather than router.push. Both keep
 * the URL honest, but router.push asks the router for the new URL's payload —
 * a network round-trip to re-fetch a page whose server output does not depend on
 * the query string at all. Next syncs pushState into useSearchParams, so the
 * wall re-filters from data the browser already has and a chip click costs
 * nothing.
 *
 * The facets sit behind dropdowns rather than in one long chip field: a library
 * grows locations faster than anything else, and eighty chips above the
 * photographs are louder than the photographs. What stays visible is what is on.
 */
export function FilterBar({ options, active, sort, seed }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState<FilterKey | 'sort' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // A menu that survives a click on the photographs behind it would sit over the
  // wall for the rest of the visit.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function go(filters: MediaFilters, nextSort: WallSort = sort, nextSeed = seed) {
    const params = serializeFilters(filters);
    if (nextSort !== DEFAULT_SORT) params.set('sort', nextSort);
    // Only the shuffle reads a seed, and carrying a stale one into the other
    // orders would leave junk in a link the visitor might share.
    if (nextSort === 'random') params.set('seed', String(nextSeed));
    const query = params.toString();
    // No scroll reset: the wall re-flows in place, and jumping to the top on
    // every chip would lose the reader's position.
    window.history.pushState(null, '', query ? `${pathname}?${query}` : pathname);
  }

  function toggle(key: FilterKey, value: string) {
    const current = active[key];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    go({ ...active, [key]: next });
  }

  // A group with nothing in it is not a filter, it is a dead label.
  const visibleGroups = GROUPS.filter((group) => options[group.key].length > 0);
  const selected = visibleGroups.flatMap((group) =>
    active[group.key].map((value) => ({ key: group.key, value })),
  );

  return (
    <div ref={barRef} className="relative z-20 mb-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3">
        {visibleGroups.map((group) => {
          const count = active[group.key].length;
          return (
            <div key={group.key} className="relative">
              <MenuButton
                open={open === group.key}
                on={count > 0}
                onClick={() => setOpen(open === group.key ? null : group.key)}
              >
                {group.label}
                {count > 0 ? <span className="text-gold"> ({count})</span> : null}
              </MenuButton>
              {open === group.key ? (
                <Menu>
                  {options[group.key].map((value) => {
                    const on = active[group.key].includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        onClick={() => toggle(group.key, value)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                          on ? 'text-gold' : 'text-bone'
                        }`}
                      >
                        <span aria-hidden className="w-3 shrink-0 text-center">
                          {on ? '✓' : ''}
                        </span>
                        {value}
                      </button>
                    );
                  })}
                </Menu>
              ) : null}
            </div>
          );
        })}

        {/* The shuffle gets its own button rather than living only in the menu:
            it is the one order a visitor re-picks, and two clicks into a
            dropdown to deal a new wall kills the impulse. */}
        <button
          type="button"
          onClick={() => go(active, 'random', randomSeed())}
          title={sort === 'random' ? 'Shuffle again' : 'Shuffle the wall'}
          aria-label={sort === 'random' ? 'Shuffle again' : 'Shuffle the wall'}
          className={`ml-auto rounded border px-2.5 py-1.5 text-sm transition ${
            sort === 'random'
              ? 'border-goldline bg-gold/5 text-gold'
              : 'border-transparent text-ash hover:border-hairline hover:text-bone'
          }`}
        >
          <ShuffleIcon />
        </button>

        <div className="relative">
          <MenuButton
            open={open === 'sort'}
            on={sort !== DEFAULT_SORT}
            onClick={() => setOpen(open === 'sort' ? null : 'sort')}
          >
            <span className="text-ash">Sort </span>
            {SORT_LABELS[sort]}
          </MenuButton>
          {open === 'sort' ? (
            <Menu align="right">
              {SORT_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === sort}
                  onClick={() => {
                    // Picking the shuffle deals a new seed every time, so
                    // choosing it again while already shuffled reshuffles rather
                    // than doing nothing visible.
                    go(active, value, value === 'random' ? randomSeed() : seed);
                    setOpen(null);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs whitespace-nowrap transition hover:bg-white/5 ${
                    value === sort ? 'text-gold' : 'text-bone'
                  }`}
                >
                  <span aria-hidden className="w-3 shrink-0 text-center">
                    {value === sort ? '✓' : ''}
                  </span>
                  {SORT_LABELS[value]}
                </button>
              ))}
            </Menu>
          ) : null}
        </div>
      </div>

      {/* Only what is switched on, so the bar stays one row until the visitor
          asks for more. */}
      {selected.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {selected.map(({ key, value }) => (
            <button
              key={`${key}:${value}`}
              type="button"
              onClick={() => toggle(key, value)}
              aria-label={`Remove filter ${value}`}
              className="rounded-full border border-goldline bg-gold/10 px-2.5 py-1 text-xs text-gold transition hover:border-gold"
            >
              {value}
              <span aria-hidden className="ml-1.5 text-gold/60">
                ×
              </span>
            </button>
          ))}
          {hasActiveFilters(active) ? (
            <button
              type="button"
              onClick={() => go(EMPTY_FILTERS)}
              className="ml-2 text-xs text-ash transition hover:text-bone"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ShuffleIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M1.5 3.5h2.2c1 0 1.7.5 2.3 1.4l3.4 5.2c.6.9 1.3 1.4 2.3 1.4h2.8" />
      <path d="M1.5 12.5h2.2c1 0 1.7-.5 2.3-1.4l.9-1.4" />
      <path d="M9.4 5.4l.6-.9c.6-.9 1.3-1.4 2.3-1.4h2.2" />
      <path d="M12.4 1.6l2 1.9-2 1.9" />
      <path d="M12.4 9.7l2 1.8-2 1.9" />
    </svg>
  );
}

function MenuButton({
  open,
  on,
  onClick,
  children,
}: {
  open: boolean;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="menu"
      className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs tracking-[0.06em] uppercase transition ${
        open || on
          ? 'border-goldline bg-gold/5 text-bone'
          : 'border-transparent text-ash hover:border-hairline hover:text-bone'
      }`}
    >
      {children}
      <span aria-hidden className={`text-[0.6rem] transition ${open ? 'rotate-180' : ''}`}>
        ▾
      </span>
    </button>
  );
}

function Menu({
  align = 'left',
  children,
}: {
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  return (
    <div
      role="menu"
      className={`absolute top-full mt-1.5 max-h-72 min-w-44 overflow-y-auto rounded border border-hairline bg-frame py-1 shadow-lg shadow-black/40 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {children}
    </div>
  );
}

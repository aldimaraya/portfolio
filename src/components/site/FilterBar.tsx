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
import { listFacet, type FacetCounts, type FacetOrder } from '@/lib/filters/facets';
import {
  DEFAULT_SORT,
  randomSeed,
  SORT_LABELS,
  SORT_ORDER,
  SORT_SHORT_LABELS,
  type WallSort,
} from '@/lib/color/sort';

interface Props {
  options: FilterOptions;
  /** Live counts: what each value would show, given the other facets. */
  counts: FacetCounts;
  /** Library-wide counts, which only order the list. */
  totals: FacetCounts;
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
 * Past this many values a group gets a search box. Below it the box is one more
 * control for a list that already fits on screen.
 */
const SEARCH_THRESHOLD = 15;

/**
 * How tall a facet panel's columns run before another is added, and how wide
 * one may get. Without them a nine-tag list spread over four full-width columns,
 * three of them half-empty, with each count a third of the screen from its name.
 */
const PANEL_ROWS = 6;
const PANEL_MAX_COLUMNS = 4;
const PANEL_COLUMN_REM = 16;

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
 * The facets sit behind a button rather than in one long chip field: a library
 * grows locations faster than anything else, and eighty chips above the
 * photographs are louder than the photographs. What stays visible is what is on.
 * Opened, though, a facet gets the full width of the wall (FacetPanel) rather
 * than a narrow dropdown, which showed ten locations at a time and made the
 * rest a scroll through a slot.
 */
export function FilterBar({ options, counts, totals, active, sort, seed }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState<FilterKey | 'sort' | null>(null);
  /**
   * Which edge the open menu hangs from. Decided when it opens rather than fixed
   * per button: the bar wraps on a narrow screen, so which buttons sit near the
   * right edge depends on the viewport — at 320px a left-anchored Tag menu hung
   * 80px off the side of the phone.
   */
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const [sheet, setSheet] = useState(false);
  // Held here rather than in the panel so it survives switching between facets.
  const [order, setOrder] = useState<FacetOrder>('alpha');
  const barRef = useRef<HTMLDivElement>(null);

  /** Opens a menu, hanging it from whichever edge keeps it on screen. */
  function openMenu(key: FilterKey | 'sort', button: HTMLElement) {
    const box = button.getBoundingClientRect();
    setAlign(box.left + box.width / 2 > window.innerWidth / 2 ? 'right' : 'left');
    setOpen(key);
  }

  // A menu that survives a click on the photographs behind it would sit over the
  // wall for the rest of the visit. Only the open surface and the bar's toggle
  // buttons keep it open — not the bar as a whole, whose empty stretch reads as
  // "outside" and used to swallow the click. The toggles are spared because
  // their own onClick decides: closing on mousedown would let the click reopen.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Element;
      const keep =
        barRef.current?.contains(target) && target.closest('[data-popover], [aria-haspopup]');
      if (!keep) setOpen(null);
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

  const activeCount = selected.length;

  return (
    <div ref={barRef} className="relative z-20 mb-5 sm:mb-8">
      {/* Phone layout. A dropdown hangs from the top of the screen, which is the
          hardest place to reach one-handed and the only place with no room: five
          controls wanted 466px of a 345px row. One button opens a sheet from the
          bottom instead, where the thumb already is and the list can be as long
          as the library needs. */}
      <div className="flex items-center gap-2 border-b border-hairline pb-3 sm:hidden">
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={`flex min-h-11 items-center gap-2 rounded border px-3 font-mono text-xs tracking-[0.06em] uppercase transition ${
            activeCount > 0
              ? 'border-goldline bg-gold/5 text-bone'
              : 'border-hairline text-ash'
          }`}
        >
          <FunnelIcon />
          Filter
          {activeCount > 0 ? <span className="text-gold">({activeCount})</span> : null}
        </button>

        <button
          type="button"
          onClick={() => setSheet(true)}
          className="flex min-h-11 items-center gap-1.5 rounded border border-hairline px-3 font-mono text-xs tracking-[0.06em] text-ash uppercase"
        >
          {SORT_SHORT_LABELS[sort]}
          <span aria-hidden className="text-[0.6rem]">
            ▾
          </span>
        </button>

        <button
          type="button"
          onClick={() => go(active, 'random', randomSeed())}
          aria-label={sort === 'random' ? 'Shuffle again' : 'Shuffle the wall'}
          className={`ml-auto flex min-h-11 min-w-11 items-center justify-center rounded border transition ${
            sort === 'random'
              ? 'border-goldline bg-gold/5 text-gold'
              : 'border-hairline text-ash'
          }`}
        >
          <ShuffleIcon />
        </button>
      </div>

      {sheet ? (
        <FilterSheet
          groups={visibleGroups}
          options={options}
          counts={counts}
          totals={totals}
          active={active}
          sort={sort}
          onToggle={toggle}
          onSort={(value) => go(active, value, value === 'random' ? randomSeed() : seed)}
          onClear={() => go(EMPTY_FILTERS)}
          onClose={() => setSheet(false)}
        />
      ) : null}

      {/* Desktop layout: buttons in a row, the facet panel hanging the full width
          beneath them. The wrapper is the panel's positioning box, so the panel
          lines up with the bar rather than with whichever button opened it. */}
      <div className="relative hidden sm:block">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3">
          {visibleGroups.map((group) => {
            const count = active[group.key].length;
            return (
              <MenuButton
                key={group.key}
                open={open === group.key}
                on={count > 0}
                popup="dialog"
                onClick={(event) =>
                  open === group.key ? setOpen(null) : openMenu(group.key, event.currentTarget)
                }
              >
                {group.label}
                {count > 0 ? <span className="text-gold"> ({count})</span> : null}
              </MenuButton>
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
            className={`ml-auto flex min-h-11 min-w-11 items-center justify-center rounded border px-2.5 py-1.5 text-sm transition sm:min-h-0 sm:min-w-0 ${
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
              onClick={(event) =>
                open === 'sort' ? setOpen(null) : openMenu('sort', event.currentTarget)
              }
            >
              {SORT_LABELS[sort]}
            </MenuButton>
            {open === 'sort' ? (
              <Menu align={align}>
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
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs whitespace-nowrap transition hover:bg-white/5 sm:py-1.5 ${
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

        {open && open !== 'sort' ? (
          <FacetPanel
            // Keyed so the search box starts empty for each facet.
            key={open}
            group={visibleGroups.find((group) => group.key === open)!}
            options={options}
            counts={counts}
            totals={totals}
            active={active}
            order={order}
            onOrder={setOrder}
            onToggle={toggle}
            onClear={() => go({ ...active, [open]: [] })}
          />
        ) : null}
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
              className="min-h-9 rounded-full border border-goldline bg-gold/10 px-3 py-1.5 text-xs text-gold transition hover:border-gold sm:min-h-0 sm:py-1"
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

/**
 * The phone's filter surface. Everything the desktop bar spreads across a row
 * stacks here with room to breathe: the sort as one tap-sized list, then every
 * facet in full rather than behind a scroll cap, because vertical space is the
 * one thing a phone has plenty of.
 *
 * Body scroll is locked while it is open. Without it a drag that starts on the
 * sheet's own list, once that list hits its end, scrolls the wall behind — and
 * the visitor loses their place in a wall they cannot see.
 */
function FilterSheet({
  groups,
  options,
  counts,
  totals,
  active,
  sort,
  onToggle,
  onSort,
  onClear,
  onClose,
}: {
  groups: { key: FilterKey; label: string }[];
  options: FilterOptions;
  counts: FacetCounts;
  totals: FacetCounts;
  active: MediaFilters;
  sort: WallSort;
  onToggle: (key: FilterKey, value: string) => void;
  onSort: (value: WallSort) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Filter and sort">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-ink/70 motion-safe:animate-[fade-in_150ms_ease-out]"
      />

      <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-xl border-t border-hairline bg-frame motion-safe:animate-[sheet-up_220ms_cubic-bezier(0.16,1,0.3,1)]">
        {/* The grab handle is decoration — the sheet is dismissed by the
            backdrop, the Done button, or Escape — but it is the shape people
            read as "this pulls up from the bottom". */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span aria-hidden className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 pb-2">
          <span className="font-mono text-xs tracking-[0.08em] text-ash uppercase">
            Filter and sort
          </span>
          {hasActiveFilters(active) ? (
            <button
              type="button"
              onClick={onClear}
              className="min-h-9 text-xs text-ash transition hover:text-bone"
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 pb-4">
          <SheetSection label="Sort">
            {SORT_ORDER.map((value) => (
              <SheetRow
                key={value}
                on={value === sort}
                role="menuitemradio"
                onClick={() => onSort(value)}
              >
                {SORT_LABELS[value]}
              </SheetRow>
            ))}
          </SheetSection>

          {groups.map((group) => (
            <SheetFacet
              key={group.key}
              group={group}
              options={options}
              counts={counts}
              totals={totals}
              active={active}
              onToggle={onToggle}
            />
          ))}
        </div>

        {/* pb-[env(safe-area-inset-bottom)] keeps the button clear of the home
            indicator, which otherwise sits right on top of it. */}
        <div className="border-t border-hairline p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded border border-goldline bg-gold/10 text-sm text-gold transition active:bg-gold/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline py-3 first:border-t-0">
      <h2 className="mb-1 font-mono text-[0.7rem] tracking-[0.08em] text-ash uppercase">
        {label}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/**
 * One facet in the phone sheet. Always alphabetical — the A–Z/Most switch is a
 * desktop nicety, and a phone list is found by the search box, not by scanning.
 */
function SheetFacet({
  group,
  options,
  counts,
  totals,
  active,
  onToggle,
}: {
  group: { key: FilterKey; label: string };
  options: FilterOptions;
  counts: FacetCounts;
  totals: FacetCounts;
  active: MediaFilters;
  onToggle: (key: FilterKey, value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const values = listFacet(options, group.key, totals, 'alpha', query);

  return (
    <SheetSection label={group.label}>
      {options[group.key].length > SEARCH_THRESHOLD ? (
        <FacetSearch
          label={group.label}
          query={query}
          onQuery={setQuery}
          className="my-1.5 min-h-11"
        />
      ) : null}
      {values.length === 0 ? <NoMatch query={query} /> : null}
      {values.map((value) => {
        const on = active[group.key].includes(value);
        const count = counts[group.key].get(value) ?? 0;
        return (
          <SheetRow
            key={value}
            on={on}
            count={count}
            disabled={count === 0 && !on}
            role="menuitemcheckbox"
            onClick={() => onToggle(group.key, value)}
          >
            {value}
          </SheetRow>
        );
      })}
    </SheetSection>
  );
}

function SheetRow({
  on,
  count,
  disabled = false,
  role,
  onClick,
  children,
}: {
  on: boolean;
  count?: number;
  disabled?: boolean;
  role: 'menuitemradio' | 'menuitemcheckbox';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2.5 text-left text-sm transition disabled:opacity-35 ${
        on ? 'text-gold' : 'text-bone'
      }`}
    >
      <span aria-hidden className="w-3.5 shrink-0 text-center">
        {on ? '✓' : ''}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {count !== undefined ? <FacetCount count={count} /> : null}
    </button>
  );
}

/**
 * The desktop facet surface: every value of one facet laid out across the width
 * of the wall, in as many columns as fit. Forty locations take ten rows of four
 * instead of a 288px slot showing ten, so the whole set is read at a glance.
 *
 * A value that would show nothing — given what the other facets have narrowed
 * to — stays listed but disabled, so the list does not change shape as the
 * visitor works through it, and no click leads to an empty wall. One already
 * on stays clickable however it counts, or it could never be turned off.
 */
function FacetPanel({
  group,
  options,
  counts,
  totals,
  active,
  order,
  onOrder,
  onToggle,
  onClear,
}: {
  group: { key: FilterKey; label: string };
  options: FilterOptions;
  counts: FacetCounts;
  totals: FacetCounts;
  active: MediaFilters;
  order: FacetOrder;
  onOrder: (order: FacetOrder) => void;
  onToggle: (key: FilterKey, value: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const values = listFacet(options, group.key, totals, order, query);
  const total = options[group.key].length;
  const selected = active[group.key].length;
  const searchable = total > SEARCH_THRESHOLD;
  // Sized from the whole facet, not the search results, so the columns hold
  // still while the visitor types.
  const columns = Math.min(PANEL_MAX_COLUMNS, Math.ceil(total / PANEL_ROWS));

  return (
    <div
      role="dialog"
      data-popover
      aria-label={`Filter by ${group.label.toLowerCase()}`}
      className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[min(32rem,70vh)] overflow-y-auto rounded border border-hairline bg-frame p-4 shadow-lg shadow-black/40"
    >
      {/* Every panel gets this row, search box or not: without the label a
          short facet's header was the order switch alone in a corner. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-[0.7rem] tracking-[0.08em] whitespace-nowrap text-ash uppercase">
          {group.label} ·{' '}
          {selected > 0 ? (
            <>
              <span className="text-gold">{selected}</span> of {total}
            </>
          ) : (
            total
          )}
        </span>
        {selected > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[0.7rem] tracking-[0.08em] text-ash uppercase transition hover:text-bone"
          >
            Clear
          </button>
        ) : null}
        {searchable ? (
          <FacetSearch
            label={group.label}
            query={query}
            onQuery={setQuery}
            autoFocus
            // Enter on a search that has narrowed to one value picks it, then
            // clears the box for the next one: typing a few places in a row
            // never needs the mouse.
            onEnter={() => {
              if (values.length !== 1) return;
              onToggle(group.key, values[0]);
              setQuery('');
            }}
            className="w-full max-w-xs"
          />
        ) : null}
        <div className="ml-auto flex items-center gap-1 font-mono text-[0.7rem] tracking-[0.06em] uppercase">
          {(['alpha', 'count'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={order === value}
              onClick={() => onOrder(value)}
              className={`rounded px-2 py-1 transition ${
                order === value ? 'bg-gold/10 text-gold' : 'text-ash hover:text-bone'
              }`}
            >
              {value === 'alpha' ? 'A–Z' : 'Most'}
            </button>
          ))}
        </div>
      </div>

      {values.length === 0 ? (
        <NoMatch query={query} />
      ) : (
        // Columns rather than a grid so the list reads down, like an index: in
        // "Most" order a grid ranks across rows, and the eye zig-zags to follow.
        // `columns: N 13rem` makes N a ceiling and 13rem a floor, so a narrow
        // window drops columns rather than crushing them.
        <div
          className="gap-x-6"
          style={{ columns: `${columns} 13rem`, maxWidth: `${columns * PANEL_COLUMN_REM}rem` }}
        >
          {values.map((value) => {
            const on = active[group.key].includes(value);
            const count = counts[group.key].get(value) ?? 0;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                disabled={count === 0 && !on}
                onClick={() => onToggle(group.key, value)}
                className={`flex w-full min-w-0 break-inside-avoid items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition hover:bg-white/5 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent ${
                  on ? 'text-gold' : 'text-bone'
                }`}
              >
                <span aria-hidden className="w-3 shrink-0 text-center">
                  {on ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 truncate" title={value}>
                  {value}
                </span>
                <FacetCount count={count} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FacetSearch({
  label,
  query,
  onQuery,
  onEnter,
  autoFocus = false,
  className = '',
}: {
  label: string;
  query: string;
  onQuery: (query: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Focused on open, so the panel answers the keyboard straight away. Not on
  // the phone, where focusing would throw up the keyboard over the list.
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <input
      ref={ref}
      type="search"
      value={query}
      onChange={(event) => onQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onEnter?.();
      }}
      placeholder={`Find a ${label.toLowerCase()}…`}
      aria-label={`Find a ${label.toLowerCase()}`}
      className={`rounded border border-hairline bg-ink px-3 py-1.5 text-sm text-bone placeholder:text-ash/70 focus:border-goldline focus:outline-none [&::-webkit-search-cancel-button]:appearance-none ${className}`}
    />
  );
}

function FacetCount({ count }: { count: number }) {
  return <span className="shrink-0 font-mono text-xs text-ash tabular-nums">{count}</span>;
}

function NoMatch({ query }: { query: string }) {
  return <p className="py-2 text-sm text-ash">Nothing matches “{query.trim()}”.</p>;
}

function FunnelIcon() {
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
      <path d="M2 3h12l-4.6 5.4v4.2l-2.8 1.4V8.4z" />
    </svg>
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
  popup = 'menu',
  onClick,
  children,
}: {
  open: boolean;
  on: boolean;
  popup?: 'menu' | 'dialog';
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup={popup}
      // min-h-11 is the 44px thumb target; from sm up the padding alone is fine.
      className={`flex min-h-11 items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs tracking-[0.06em] uppercase transition sm:min-h-0 ${
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
      data-popover
      // z-30 because the controls after this one in the DOM — the shuffle and
      // the sort menu — would otherwise paint straight through an open panel
      // once the bar wraps and they share its vertical space.
      className={`absolute top-full z-30 mt-1.5 max-h-72 min-w-44 max-w-[calc(100vw-3rem)] overflow-y-auto rounded border border-hairline bg-frame py-1 shadow-lg shadow-black/40 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {children}
    </div>
  );
}

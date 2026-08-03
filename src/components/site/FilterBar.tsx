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
  SORT_SHORT_LABELS,
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
  /**
   * Which edge the open menu hangs from. Decided when it opens rather than fixed
   * per button: the bar wraps on a narrow screen, so which buttons sit near the
   * right edge depends on the viewport — at 320px a left-anchored Tag menu hung
   * 80px off the side of the phone.
   */
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const [sheet, setSheet] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  /** Opens a menu, hanging it from whichever edge keeps it on screen. */
  function openMenu(key: FilterKey | 'sort', button: HTMLElement) {
    const box = button.getBoundingClientRect();
    setAlign(box.left + box.width / 2 > window.innerWidth / 2 ? 'right' : 'left');
    setOpen(key);
  }

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
          active={active}
          sort={sort}
          onToggle={toggle}
          onSort={(value) => go(active, value, value === 'random' ? randomSeed() : seed)}
          onClear={() => go(EMPTY_FILTERS)}
          onClose={() => setSheet(false)}
        />
      ) : null}

      {/* Desktop layout: the dropdowns, which are right for a pointer and a wide
          row. */}
      <div className="hidden flex-wrap items-center gap-2 border-b border-hairline pb-3 sm:flex">
        {visibleGroups.map((group) => {
          const count = active[group.key].length;
          return (
            <div key={group.key} className="relative">
              <MenuButton
                open={open === group.key}
                on={count > 0}
                onClick={(event) =>
                  open === group.key ? setOpen(null) : openMenu(group.key, event.currentTarget)
                }
              >
                {group.label}
                {count > 0 ? <span className="text-gold"> ({count})</span> : null}
              </MenuButton>
              {open === group.key ? (
                <Menu align={align}>
                  {options[group.key].map((value) => {
                    const on = active[group.key].includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        onClick={() => toggle(group.key, value)}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-white/5 sm:py-1.5 ${
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
  active,
  sort,
  onToggle,
  onSort,
  onClear,
  onClose,
}: {
  groups: { key: FilterKey; label: string }[];
  options: FilterOptions;
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
            <SheetSection key={group.key} label={group.label}>
              {options[group.key].map((value) => (
                <SheetRow
                  key={value}
                  on={active[group.key].includes(value)}
                  role="menuitemcheckbox"
                  onClick={() => onToggle(group.key, value)}
                >
                  {value}
                </SheetRow>
              ))}
            </SheetSection>
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

function SheetRow({
  on,
  role,
  onClick,
  children,
}: {
  on: boolean;
  role: 'menuitemradio' | 'menuitemcheckbox';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2.5 text-left text-sm transition ${
        on ? 'text-gold' : 'text-bone'
      }`}
    >
      <span aria-hidden className="w-3.5 shrink-0 text-center">
        {on ? '✓' : ''}
      </span>
      {children}
    </button>
  );
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
  onClick,
  children,
}: {
  open: boolean;
  on: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="menu"
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

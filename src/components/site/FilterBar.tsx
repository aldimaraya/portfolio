'use client';

import { usePathname } from 'next/navigation';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  serializeFilters,
  type MediaFilters,
} from '@/lib/filters/parse';
import type { FilterOptions } from '@/lib/filters/apply';

interface Props {
  options: FilterOptions;
  active: MediaFilters;
}

type FilterKey = keyof MediaFilters;

const GROUPS: { key: FilterKey; label: string }[] = [
  { key: 'cameras', label: 'Camera' },
  { key: 'locations', label: 'Location' },
  { key: 'tags', label: 'Tag' },
];

/**
 * Filter state lives in the URL, not in component state, so a filtered wall is a
 * shareable link and the back button steps through filter changes.
 *
 * The URL is updated through the History API rather than router.push. Both keep
 * the URL honest, but router.push asks the router for the new URL's payload —
 * a network round-trip to re-fetch a page whose server output does not depend on
 * the query string at all. Next syncs pushState into useSearchParams, so the
 * wall re-filters from data the browser already has and a chip click costs
 * nothing.
 */
export function FilterBar({ options, active }: Props) {
  const pathname = usePathname();

  function go(filters: MediaFilters) {
    const query = serializeFilters(filters).toString();
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
  if (visibleGroups.length === 0) return null;

  return (
    <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded border border-hairline bg-frame/80 px-4 py-3">
      {visibleGroups.map((group) => (
        <div key={group.key} className="flex items-center gap-2">
          <span className="font-mono text-xs tracking-[0.08em] text-ash uppercase">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {options[group.key].map((value) => {
              const on = active[group.key].includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggle(group.key, value)}
                  aria-pressed={on}
                  className={`rounded border px-2.5 py-1 text-xs transition ${
                    on
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-white/15 text-bone hover:border-white/40'
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {hasActiveFilters(active) ? (
        <button
          type="button"
          onClick={() => go(EMPTY_FILTERS)}
          className="ml-auto text-xs text-ash transition hover:text-bone"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

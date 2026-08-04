'use client';

import { useEffect, useRef } from 'react';

/** The contact sheet alongside the strip: every frame at once, and a way to jump. */
export function RollIndex({
  titles,
  activeIndex,
  onJump,
}: {
  titles: string[];
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // "Every frame at once" stops being true once the list scrolls, which it always
  // does in the stacked row: without this the highlight tracks the film off-screen
  // and the index reads as frozen on whichever clip happened to be first.
  // `nearest` so a frame already in view does not get yanked to the middle.
  useEffect(() => {
    const child = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeIndex]);

  return (
    // Stacked under the strip it must not grow with the clip count, or a long
    // roll would push the film out of the sticky viewport entirely — hence the
    // fixed height and a shrink-0, with the overflow turned on its side below.
    <aside className="flex w-60 flex-col rounded border border-hairline bg-frame/80 p-5 max-strip:h-32 max-strip:w-full max-strip:shrink-0 max-strip:p-3">
      <div className="mb-3 border-b border-hairline pb-2 font-mono text-[0.7rem] tracking-[0.1em] text-ash uppercase">
        Roll index ({titles.length})
      </div>
      <div ref={listRef} className="flex min-h-0 flex-col gap-1.5 overflow-y-auto max-strip:flex-row max-strip:overflow-x-auto max-strip:overflow-y-hidden">
        {titles.map((title, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={`${index}-${title}`}
              type="button"
              onClick={() => onJump(index)}
              aria-current={active ? 'true' : undefined}
              // Laid out in a row the buttons would otherwise shrink to fit the
              // viewport instead of scrolling, so a long roll ends up as slivers.
              className={`flex flex-col items-start rounded border px-3 py-2.5 text-left transition max-strip:w-32 max-strip:shrink-0 ${
                active
                  ? 'border-gold bg-white/10'
                  : 'border-transparent hover:border-white/15 hover:bg-white/5'
              }`}
            >
              <span className="font-mono text-xs font-bold text-gold">
                [{String(index + 1).padStart(2, '0')}A]
              </span>
              <span className={`mt-0.5 w-full truncate text-xs ${active ? 'text-bone' : 'text-ash'}`}>
                {title}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

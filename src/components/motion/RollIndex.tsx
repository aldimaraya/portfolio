'use client';

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
  return (
    <aside className="flex w-60 flex-col rounded border border-hairline bg-frame/80 p-5 max-strip:w-full">
      <div className="mb-3 border-b border-hairline pb-2 font-mono text-[0.7rem] tracking-[0.1em] text-ash uppercase">
        Roll index ({titles.length})
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto max-strip:flex-row">
        {titles.map((title, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={`${index}-${title}`}
              type="button"
              onClick={() => onJump(index)}
              aria-current={active ? 'true' : undefined}
              className={`flex flex-col items-start rounded border px-3 py-2.5 text-left transition ${
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

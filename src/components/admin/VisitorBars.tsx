'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';

const DAY_LABEL = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  // Views are stored by UTC day, so the days are labelled in UTC too.
  timeZone: 'UTC',
});

/**
 * Distinct visitors per day as bars, today last — the Overview's week and the
 * Engagement page's range. A returning visitor counts again on each day they
 * come, which is why the totals beside these are sums of them rather than
 * counts of people: the view hash cannot match one day to the next.
 *
 * `marks` flags days a newsletter went out with a gold tick above the bar, so a
 * bump the day after reads as what it is.
 *
 * Hover only exists on a mouse (Tailwind v4 gates `hover:` behind `(hover:
 * hover)`), so a touch picks its day from where the finger lands on the whole
 * plot rather than on the bar itself: across ninety days a bar is a couple of
 * pixels wide on a phone, and nobody hits that. Sliding sideways scrubs; the
 * tip stays up after the finger lifts and goes on a tap anywhere else.
 */
export function VisitorBars({
  daily,
  start,
  marks,
  className = 'h-12',
}: {
  daily: number[];
  start: Date;
  marks?: boolean[];
  /** The plot's height. */
  className?: string;
}) {
  const peak = Math.max(...daily, 1);
  const plot = useRef<HTMLOListElement>(null);
  const scrubbing = useRef(false);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (active === null) return;
    const dismiss = (e: globalThis.PointerEvent) => {
      if (!plot.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [active]);

  const pick = (e: PointerEvent<HTMLOListElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * daily.length);
    setActive(Math.min(Math.max(i, 0), daily.length - 1));
  };

  return (
    <ol
      ref={plot}
      // pan-y leaves vertical swipes to the page and hands sideways ones to the scrub.
      className={`flex touch-pan-y items-end ${daily.length > 40 ? 'gap-px' : 'gap-0.5'} ${className}`}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        scrubbing.current = true;
        pick(e);
      }}
      onPointerMove={(e) => {
        if (scrubbing.current) pick(e);
      }}
      onPointerUp={() => (scrubbing.current = false)}
      onPointerCancel={() => (scrubbing.current = false)}
    >
      {daily.map((count, i) => {
        const day = new Date(start);
        day.setUTCDate(day.getUTCDate() + i);
        const date = DAY_LABEL.format(day);
        const visitors = `${count} ${count === 1 ? 'visitor' : 'visitors'}`;
        const shown = active === i;
        const sent = marks?.[i] ?? false;
        // The tips at either end hang inward, or they would poke out of the card.
        const edge = Math.max(1, Math.round(daily.length / 8));
        const align =
          i < edge ? 'left-0' : i >= daily.length - edge ? 'right-0' : 'left-1/2 -translate-x-1/2';
        return (
          <li key={i} className="group flex h-full min-w-0 flex-1 items-end">
            <span className="sr-only">{`${date}: ${visitors}${sent ? ', newsletter sent' : ''}`}</span>
            {/* A day nobody came keeps a hairline, so the range still reads as so many days. */}
            <span
              aria-hidden="true"
              className={`relative w-full rounded-t-[4px] transition ${count ? (shown ? 'bg-gold' : 'bg-gold/70 group-hover:bg-gold') : 'bg-white/10'}`}
              style={{ height: count ? `${Math.max((count / peak) * 100, 6)}%` : 2 }}
            >
              {sent ? (
                <span className="absolute -top-3 left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full bg-gold" />
              ) : null}
              {/* Hung off the bar's top, so it points at the value it names. */}
              <span
                className={`pointer-events-none absolute bottom-full z-10 mb-1.5 flex flex-col gap-0.5 rounded-md border border-hairline bg-frame px-2.5 py-1.5 whitespace-nowrap shadow-lg shadow-black/40 transition-opacity ${shown ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} motion-reduce:transition-none ${align}`}
              >
                <span className="font-mono text-[10px] tracking-[0.15em] text-ash uppercase">{date}</span>
                <span className="text-sm text-bone tabular-nums">{visitors}</span>
                {sent ? <span className="text-xs text-gold">Newsletter went out</span> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

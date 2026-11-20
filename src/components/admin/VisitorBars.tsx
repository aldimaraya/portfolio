'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { countOf } from '@/lib/admin/format';

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

  // A pick is an index, so it only means something against the range it was
  // made on: a new range (or a re-render with a shorter one) drops it rather
  // than pointing the tip at whatever day now sits in that slot.
  const from = start.getTime();
  const range = `${from}:${daily.length}`;
  const [picked, setPicked] = useState<{ range: string; i: number } | null>(null);
  const active = picked?.range === range ? picked.i : null;
  const open = active !== null;

  // Built once per range, not on every pointermove that crosses a day.
  const labels = useMemo(() => {
    return Array.from({ length: daily.length }, (_, i) => {
      const day = new Date(from);
      day.setUTCDate(day.getUTCDate() + i);
      return DAY_LABEL.format(day);
    });
  }, [from, daily.length]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (e: globalThis.PointerEvent) => {
      if (!plot.current?.contains(e.target as Node)) setPicked(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  const pick = (e: PointerEvent<HTMLOListElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * daily.length);
    setPicked({ range, i: Math.min(Math.max(i, 0), daily.length - 1) });
  };

  return (
    <ol
      ref={plot}
      // pan-y leaves vertical swipes to the page and hands sideways ones to the
      // scrub; select-none and no callout stop a press-and-hold turning into iOS
      // text selection before the finger starts to slide.
      className={`flex touch-pan-y items-end select-none [-webkit-touch-callout:none] ${daily.length > 40 ? 'gap-px' : 'gap-0.5'} ${className}`}
      onPointerDown={(e) => {
        // A mouse has hover; on a hybrid laptop it also clears a tip left by touch,
        // or the two would show side by side.
        if (e.pointerType === 'mouse') return setPicked(null);
        // A pen gets no implicit capture, so without this one lifted off the plot
        // never sends pointerup and its hovering keeps scrubbing.
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubbing.current = true;
        pick(e);
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse' && open) setPicked(null);
      }}
      onPointerMove={(e) => {
        if (scrubbing.current) pick(e);
      }}
      onPointerUp={() => (scrubbing.current = false)}
      // The browser cancels when it takes the touch as a vertical scroll: that
      // finger was scrolling the page, not asking about a day.
      onPointerCancel={() => {
        scrubbing.current = false;
        setPicked(null);
      }}
    >
      {daily.map((count, i) => {
        const date = labels[i];
        const visitors = countOf(count, ['visitor', 'visitors']);
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

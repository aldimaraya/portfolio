'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { pageBusy, serverPageBusy, subscribePageBusy } from './page-busy';

type Phase = 'idle' | 'loading' | 'done';

/** Past this, a navigation that never landed (cancelled, errored) stops claiming to be in progress. */
const GIVE_UP_MS = 10_000;
/** How long the completed bar lingers at full width before it fades. */
const DONE_MS = 220;

/**
 * A gold bar across the top of the window from the moment a link is clicked
 * until the new page is ready to show.
 *
 * The router gives no signal of its own at the click: even a prefetched page
 * costs a frame or more between the click and the URL changing, and a page that
 * was not prefetched can cost far longer, and in both cases nothing on screen
 * acknowledged the click. This listens for the click itself — on the document,
 * so every link takes part without each one opting in — and finishes once the
 * pathname has moved *and* the new page has stopped holding its content back for
 * media (see page-busy.ts). Finishing at the route change alone would leave the
 * stills wall's first 180ms blank: the bar gone, the content still hidden, and
 * the developing loader not yet allowed to show. Running on through that gap
 * makes the click, the loader and the cascade one continuous wait.
 *
 * Search-only links on the current page are left out: they do not change the
 * pathname, so nothing would ever finish the bar, and they are History API
 * updates that land within the frame anyway.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const startedFrom = useRef<string | null>(null);
  const busy = useSyncExternalStore(subscribePageBusy, pageBusy, serverPageBusy);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      startedFrom.current = window.location.pathname;
      setPhase('loading');
    }

    // Capture phase: next/link calls preventDefault on the bubble, and a handler
    // further up that stops propagation should not hide the click from this.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (phase !== 'loading') return;
    if (startedFrom.current !== null && pathname !== startedFrom.current && !busy) {
      // Deferred a frame: the bar is mid-way through its first paint when a
      // prefetched page commits, and jumping straight to "done" would skip the
      // one frame that shows the click was seen.
      const frame = requestAnimationFrame(() => setPhase('done'));
      return () => cancelAnimationFrame(frame);
    }
    const giveUp = setTimeout(() => setPhase('idle'), GIVE_UP_MS);
    return () => clearTimeout(giveUp);
  }, [pathname, phase, busy]);

  useEffect(() => {
    if (phase !== 'done') return;
    const fade = setTimeout(() => {
      startedFrom.current = null;
      setPhase('idle');
    }, DONE_MS);
    return () => clearTimeout(fade);
  }, [phase]);

  return <div aria-hidden className="nav-progress" data-phase={phase} />;
}

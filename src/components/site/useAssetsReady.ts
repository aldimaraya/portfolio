'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { holdPage } from './page-busy';

/**
 * Gates a page's entry animation on its images actually arriving.
 *
 * The public pages are static and prefetched, so there is no data to wait for —
 * the only thing a visitor ever waits on is media coming off the CDN. A loading
 * state driven by a timer would therefore be a lie in both directions: it would
 * show on a warm cache where nothing is loading, and clear on a cold one while
 * the frames are still empty. This counts real load events instead.
 *
 * Three guards stop the gate from becoming the delay it exists to explain, or
 * from explaining it badly:
 *
 * - Nothing is shown for the first `GRACE_MS`. A cached wall resolves inside one
 *   frame, and a loader for that is noise. The gap is not blank time to the
 *   visitor: the page counts as busy while the gate is shut (see page-busy.ts),
 *   so NavigationProgress keeps its bar running through it.
 * - Once shown, the loader stays for at least `MIN_VISIBLE_MS`. A loader that
 *   appears and vanishes in 60ms reads as a glitch, not as progress — and the
 *   grace period alone cannot prevent that, only move it.
 * - The gate opens at `CAP_MS` whether or not the media arrived. A dead CDN, a
 *   blocked request or an image that fires neither load nor error must not be
 *   able to hold the page hostage; past the cap the content is shown regardless
 *   and the images fill in as they land.
 */

/** Below this, resolve silently — see above. */
const GRACE_MS = 180;

/** Once the loader is up, it stays at least this long. */
const MIN_VISIBLE_MS = 400;

/** Above this, give up waiting and show the page anyway. */
const CAP_MS = 2500;

export interface GateTiming {
  /** Whether the entry animation may run. */
  ready: boolean;
  /** Whether to render a loading indicator — never true before the grace period. */
  showLoader: boolean;
}

/**
 * The timing rules above, for any gate that can say whether its media has
 * settled. `useAssetsReady` counts load events into it; AssetGate tracks a set
 * of registered assets.
 */
export function useGateTiming(settled: boolean): GateTiming {
  const [ready, setReady] = useState(settled);
  /** When the loader appeared, or null if it never has. */
  const [loaderSince, setLoaderSince] = useState<number | null>(null);
  const [capped, setCapped] = useState(false);

  // Layout effect, so the page is marked busy in the same commit that mounts it
  // — before NavigationProgress's passive effect looks to see whether it can
  // finish.
  useLayoutEffect(() => {
    if (ready) return;
    return holdPage();
  }, [ready]);

  useEffect(() => {
    // Settled stops the grace timer too: media that lands at 179ms should go
    // straight to the cascade, not summon a loader one millisecond later.
    if (ready || settled) return;
    const grace = setTimeout(() => setLoaderSince(performance.now()), GRACE_MS);
    const cap = setTimeout(() => setCapped(true), CAP_MS);
    return () => {
      clearTimeout(grace);
      clearTimeout(cap);
    };
  }, [ready, settled]);

  useEffect(() => {
    if (ready || !(settled || capped)) return;
    const remaining =
      loaderSince === null ? 0 : MIN_VISIBLE_MS - (performance.now() - loaderSince);
    const open = setTimeout(() => setReady(true), Math.max(0, remaining));
    return () => clearTimeout(open);
  }, [ready, settled, capped, loaderSince]);

  return { ready, showLoader: !ready && loaderSince !== null };
}

export interface AssetsReady extends GateTiming {
  /** Pass to each tracked asset's load *and* error handler. */
  noteSettled: () => void;
}

/** A gate that opens once `expected` assets have reported in. */
export function useAssetsReady(expected: number): AssetsReady {
  const [settled, setSettled] = useState(expected <= 0);
  const count = useRef(0);

  // Counted in a ref rather than state: an image landing is not on its own a
  // reason to re-render the wall, and a wall of sixty would otherwise re-render
  // sixty times on its way to a single boolean.
  const noteSettled = useCallback(() => {
    count.current += 1;
    if (count.current >= expected) setSettled(true);
  }, [expected]);

  return { ...useGateTiming(settled), noteSettled };
}

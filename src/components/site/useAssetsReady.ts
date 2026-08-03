'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Gates a page's entry animation on its images actually arriving.
 *
 * Both public walls are static and prefetched, so there is no data to wait for —
 * the only thing a visitor ever waits on is media coming off the CDN. A loading
 * state driven by a timer would therefore be a lie in both directions: it would
 * show on a warm cache where nothing is loading, and clear on a cold one while
 * the frames are still empty. This counts real load events instead.
 *
 * Two guards stop the gate from becoming the delay it exists to explain:
 *
 * - Nothing is shown for the first `GRACE_MS`. A cached wall resolves inside one
 *   frame, and a loader that appears and vanishes in 40ms is worse than no
 *   loader — it reads as a flicker, not as progress. Below the grace period the
 *   visitor goes straight to the cascade and never learns this code exists.
 * - The gate opens at `CAP_MS` whether or not the count was reached. A dead CDN,
 *   a blocked request or an image that fires neither load nor error must not be
 *   able to hold the page hostage; past the cap the content is shown regardless
 *   and the images fill in as they land.
 */

/** Below this, resolve silently — see above. */
const GRACE_MS = 180;

/** Above this, give up waiting and show the page anyway. */
const CAP_MS = 2500;

export interface AssetsReady {
  /** Whether the entry animation may run. */
  ready: boolean;
  /** Whether to render a loading indicator — never true before the grace period. */
  showLoader: boolean;
  /** Pass to each tracked asset's load *and* error handler. */
  noteSettled: () => void;
}

export function useAssetsReady(expected: number): AssetsReady {
  const [ready, setReady] = useState(expected <= 0);
  const [graceElapsed, setGraceElapsed] = useState(false);
  const settled = useRef(0);

  // Counted in a ref rather than state: an image landing is not on its own a
  // reason to re-render the wall, and a wall of sixty would otherwise re-render
  // sixty times on its way to a single boolean.
  const noteSettled = useCallback(() => {
    settled.current += 1;
    if (settled.current >= expected) setReady(true);
  }, [expected]);

  useEffect(() => {
    if (ready) return;
    const grace = setTimeout(() => setGraceElapsed(true), GRACE_MS);
    const cap = setTimeout(() => setReady(true), CAP_MS);
    return () => {
      clearTimeout(grace);
      clearTimeout(cap);
    };
  }, [ready]);

  return { ready, showLoader: !ready && graceElapsed, noteSettled };
}

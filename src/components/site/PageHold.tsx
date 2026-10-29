'use client';

import { useLayoutEffect } from 'react';
import { holdPage } from './page-busy';

/**
 * A Suspense fallback that draws nothing but marks the page busy, so
 * NavigationProgress keeps running until the suspended content mounts — and,
 * with it, the asset gate that takes the hold over in the same commit. Without
 * it the bar finishes at the route change and the page sits blank until the
 * boundary resolves.
 */
export function PageHold() {
  useLayoutEffect(() => holdPage(), []);
  return null;
}

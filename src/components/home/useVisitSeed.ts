'use client';

import { useSyncExternalStore } from 'react';
import { randomSeed } from '@/lib/color/sort';

/**
 * One seed per page load, for the home page's deal of stills and clips.
 *
 * The page stays statically rendered — a front door that waits on a database
 * read every visit is slower for the sake of a shuffle — so the randomness has
 * to happen here, in the browser. `null` on the server and through hydration
 * (useSyncExternalStore's server snapshot), which is what keeps a random pick
 * from mismatching the prerendered HTML; the real seed arrives in the render
 * straight after.
 *
 * Module-level rather than per-mount, so the strip and the clips draw from the
 * same seed, and coming back to `/` by the back button or the nav finds the deal
 * the visitor left rather than a new one. A reload deals again.
 */
let seed: number | undefined;

const subscribe = () => () => {};
const getSeed = () => (seed ??= randomSeed());
const getServerSeed = () => null;

export function useVisitSeed(): number | null {
  return useSyncExternalStore(subscribe, getSeed, getServerSeed);
}

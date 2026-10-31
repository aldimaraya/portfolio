/**
 * Caps how many likes and views one address can write. A like costs nothing to
 * forge — clear the cookie and you are a new visitor — so without this a loop
 * from one machine could put any number on any item. It does not make a like
 * unforgeable; it makes forging one slow enough to be pointless.
 *
 * In-memory per instance, with the same accepted trade as lib/auth/rate-limit
 * and lib/newsletter/throttle: spread across cold instances an attacker gets
 * more than the cap, and the attack it has to stop — one source hammering a
 * warm instance — does not.
 */

/**
 * Generous for a person: liking and unliking every photo on the wall once is
 * well inside it. A view is one per page load or per still the lightbox rests
 * on, so its budget is a browsing session's worth of both — someone stepping
 * through the whole wall must not use up the views of the clips they open next.
 */
export const BUDGETS = {
  like: { max: 120, windowMs: 60 * 60 * 1000 },
  view: { max: 400, windowMs: 60 * 60 * 1000 },
} as const;

export type Budget = keyof typeof BUDGETS;

const MAX_TRACKED = 10_000;

const writes = new Map<string, { count: number; expiresAt: number }>();

/** Counts one write and says whether it may go ahead. */
export function allowWrite(budget: Budget, key: string, now: number = Date.now()): boolean {
  for (const [tracked, entry] of writes) {
    if (entry.expiresAt <= now) writes.delete(tracked);
  }

  const { max, windowMs } = BUDGETS[budget];
  // One map for both budgets, keyed apart, so the cap on tracked entries is one
  // number rather than two that each have to be reasoned about.
  const slot = `${budget}:${key}`;
  const entry = writes.get(slot);
  if (entry && entry.count >= max) return false;

  writes.set(slot, entry ? { ...entry, count: entry.count + 1 } : { count: 1, expiresAt: now + windowMs });

  if (writes.size > MAX_TRACKED) {
    const oldest = writes.keys().next();
    if (!oldest.done) writes.delete(oldest.value);
  }
  return true;
}

/** Test seam. */
export function resetWriteThrottle(): void {
  writes.clear();
}

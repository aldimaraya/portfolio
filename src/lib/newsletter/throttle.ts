/**
 * Caps how many signups one address can submit, because every signup sends an
 * email and each one spends the provider's daily quota — a script filling the
 * form in a loop would otherwise use up the day's sends and mail a list of
 * strangers in the process. The per-inbox resend limit (CONFIRM_RESEND_MS) stops
 * one inbox being flooded; this stops one source flooding many.
 *
 * In-memory per instance, with the same accepted trade as lib/auth/rate-limit:
 * spread across cold instances an attacker gets more than the cap, and the
 * attack it has to stop — one source hammering a warm instance — does not.
 */

export const MAX_SIGNUPS = 5;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 10_000;

const signups = new Map<string, { count: number; expiresAt: number }>();

/** Counts one signup and says whether it may go ahead. */
export function allowSignup(key: string, now: number = Date.now()): boolean {
  for (const [tracked, entry] of signups) {
    if (entry.expiresAt <= now) signups.delete(tracked);
  }

  const entry = signups.get(key);
  if (entry && entry.count >= MAX_SIGNUPS) return false;

  // Fixed window from the first signup, unlike the login limiter's sliding one:
  // a person legitimately retrying a typo should get their slots back.
  signups.set(key, entry ? { ...entry, count: entry.count + 1 } : { count: 1, expiresAt: now + SIGNUP_WINDOW_MS });

  if (signups.size > MAX_TRACKED) {
    const oldest = signups.keys().next();
    if (!oldest.done) signups.delete(oldest.value);
  }
  return true;
}

/** Test seam. */
export function resetSignupThrottle(): void {
  signups.clear();
}

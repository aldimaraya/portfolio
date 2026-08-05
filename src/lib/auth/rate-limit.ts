/**
 * Failed-login throttling for the single admin password.
 *
 * The password is the whole of the defence on `/admin`, and bcrypt(12) only
 * throttles an attacker who guesses *serially* — fire fifty requests at once and
 * fifty full-CPU Node invocations run in parallel, which is a credential risk and
 * a hosting bill at the same time. This caps both.
 *
 * Deliberately in-memory, not KV. State lives per serverless instance and is lost
 * on a cold start, so a determined attacker who can spread across instances gets
 * more than `MAX_FAILURES` attempts in total. That is an accepted trade: it costs
 * nothing, adds no dependency, and the attack it actually has to stop — one
 * source firing a dictionary as fast as it can — lands on one warm instance and
 * is stopped cold. Swap the Map for Upstash if that assumption ever stops
 * holding.
 *
 * The clock is a parameter throughout rather than a call to `Date.now()` inside,
 * so the window and lockout behaviour can be tested without waiting for it.
 */

/** Failures tolerated inside one window before the address is locked out. */
export const MAX_FAILURES = 8;

/** How long failures are remembered, and how long a lockout lasts once tripped. */
export const WINDOW_MS = 15 * 60 * 1000;

/**
 * Cap on tracked addresses. A spoofed-IP flood would otherwise grow this map
 * without bound — which turns a defence against one resource exhaustion into a
 * different one. At the cap the oldest entry is dropped, which is the right
 * victim: it is the one closest to expiring anyway.
 */
const MAX_TRACKED = 10_000;

type Attempts = { failures: number; expiresAt: number };

const attempts = new Map<string, Attempts>();

/** Drops entries whose window has closed. Called on every write, so the map is
 *  swept by ordinary traffic rather than by a timer that would keep an idle
 *  instance alive. */
function prune(now: number): void {
  for (const [key, entry] of attempts) {
    if (entry.expiresAt <= now) attempts.delete(key);
  }
}

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Whether this address may attempt a password right now. Read-only — a failure
 * is only counted once the password is actually known to be wrong.
 */
export function checkRateLimit(key: string, now: number = Date.now()): RateLimitVerdict {
  const entry = attempts.get(key);
  if (!entry || entry.expiresAt <= now || entry.failures < MAX_FAILURES) {
    return { allowed: true };
  }
  // Rounded up so a caller that waits exactly this long is past the expiry
  // rather than one millisecond short of it.
  return { allowed: false, retryAfterSeconds: Math.ceil((entry.expiresAt - now) / 1000) };
}

/**
 * Counts one wrong password. Each failure re-arms the window from now, so a
 * steady trickle of guesses never ages out of its own count — sitting just under
 * the limit forever is exactly the attack a fixed window would allow.
 */
export function recordFailure(key: string, now: number = Date.now()): void {
  prune(now);

  const entry = attempts.get(key);
  const failures = entry && entry.expiresAt > now ? entry.failures + 1 : 1;
  attempts.set(key, { failures, expiresAt: now + WINDOW_MS });

  if (attempts.size > MAX_TRACKED) {
    // Map iterates in insertion order, and every write re-inserts, so the first
    // key is the least recently active one.
    const oldest = attempts.keys().next();
    if (!oldest.done) attempts.delete(oldest.value);
  }
}

/** Clears an address's count. Called on a correct password: the person at the
 *  keyboard who mistyped twice and then got it right starts clean. */
export function clearFailures(key: string): void {
  attempts.delete(key);
}

/** Test seam. Never called by the route. */
export function resetRateLimit(): void {
  attempts.clear();
}

/**
 * The address a request is attributed to.
 *
 * `x-forwarded-for` is trivially forged in general, but on Vercel the platform
 * proxy rewrites it and the client cannot append to it, so the *first* entry is
 * the real peer. Taking the first rather than the last is what makes that true —
 * a forged header arrives as `evil, real` and the last entry is the attacker's
 * to choose. An unattributable request falls back to one shared bucket, which
 * throttles those requests collectively rather than not at all.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || headers.get('x-real-ip')?.trim() || 'unknown';
}

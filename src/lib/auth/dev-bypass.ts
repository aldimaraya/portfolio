/**
 * TEMPORARY development-only auth bypass, so the admin panel can be exercised
 * without a login while the backend is still being built.
 *
 * Two conditions must both hold, and the NODE_ENV one is not configurable:
 * `next build` and `next start` set NODE_ENV to "production", so a deployed
 * instance cannot enable this no matter what its environment says. That matters
 * here because development points at the *live* Neon database and R2 bucket —
 * an auth hole that escaped to production would expose real content, not a
 * throwaway dev dataset.
 *
 * DELETE THIS FILE (and its three call sites: proxy.ts, guard.ts) once the admin
 * panel is done. Search for DEV_SKIP_AUTH to find everything.
 */

let warned = false;

export function devAuthBypassEnabled(): boolean {
  const enabled =
    process.env.NODE_ENV !== 'production' && process.env.DEV_SKIP_AUTH === 'true';

  // Logged once per process so an accidentally-left-on bypass is visible in the
  // dev server output rather than silently making everything look authorised.
  if (enabled && !warned) {
    warned = true;
    console.warn(
      '\n  ⚠  DEV_SKIP_AUTH is on — /admin is UNAUTHENTICATED. Development only.\n',
    );
  }

  return enabled;
}

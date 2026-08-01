'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the current visitor is the signed-in admin, asked of the server after
 * hydration rather than resolved during render.
 *
 * The session cookie is httpOnly, so the client cannot read it directly — and
 * that is the point: reading it on the server made every public page dynamic
 * (see AdminBar). The trade is that admin chrome appears a beat after the page
 * does. Only the admin ever sees that beat, and it costs a visitor nothing.
 *
 * The answer is held at module scope and shared, so the bar and an edit link on
 * the same page ask once between them, and moving between public pages does not
 * ask again.
 */

let cached: boolean | undefined;
let inFlight: Promise<void> | null = null;

const listeners = new Set<() => void>();

function publish(value: boolean): void {
  cached = value;
  for (const listener of listeners) listener();
}

function load(): void {
  // One request however many components are mounted, and none at all once the
  // answer is known.
  inFlight ??= fetch('/api/auth/state')
    .then((response) => (response.ok ? response.json() : { admin: false }))
    .then((data: { admin?: boolean }) => publish(data.admin === true))
    // A failed check means no chrome, which is what a visitor sees anyway —
    // there is nothing useful to show or say here.
    .catch(() => publish(false))
    .finally(() => {
      inFlight = null;
    });
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Kicked off from here rather than from an effect, so a subscriber can never
  // miss the answer arriving between its render and its subscription.
  if (cached === undefined) load();

  return () => {
    listeners.delete(onChange);
  };
}

/**
 * useSyncExternalStore rather than state plus an effect: this is a store outside
 * React that several components read at once, which is the case the hook exists
 * for. The server snapshot is always false — the static HTML is built for a
 * visitor, and claiming otherwise would be a hydration mismatch on every page.
 */
export function useIsAdmin(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => cached ?? false,
    () => false,
  );
}

/**
 * Sets the answer without asking, for the one case that already knows it: the
 * sign-out button, whose whole job is to make this false. Without it the bar
 * would sit there until a reload, since the cookie it depends on is gone but the
 * cached answer is not.
 */
export function setAdminState(value: boolean): void {
  publish(value);
}

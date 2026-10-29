'use client';

import { useSyncExternalStore } from 'react';

/**
 * A per-device admin preference (thumbnail size, captions on or off) kept in
 * localStorage. Not in the URL: unlike a filter, nobody shares a link to "my
 * thumbnails a bit bigger", and it should survive arriving from any link.
 *
 * useSyncExternalStore rather than state plus an effect, as in useIsAdmin: the
 * server snapshot is the fallback, so hydration matches the HTML and the stored
 * value arrives in the render straight after. Storage can throw (private mode,
 * blocked site data), and then the preference simply does not stick.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredPreference(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key) ?? fallback,
    () => fallback,
  );

  function set(next: string) {
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Not persisted; fine for a preference.
    }
    // The storage event only fires in other tabs, so tell this one directly.
    for (const listener of listeners) listener();
  }

  return [value, set];
}

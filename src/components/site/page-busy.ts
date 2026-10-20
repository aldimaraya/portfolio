/**
 * Whether the page on screen is still holding its content back for media — the
 * one signal NavigationProgress needs from the asset gates, which sit deep in a
 * page it cannot see into.
 *
 * A count rather than a flag because a page can hold more than one gate (the
 * wall and its loader, the home page's strip and clips), and the bar should
 * finish when the last of them opens, not the first.
 *
 * Module state, so it is per-tab and client-only — it is never read on the
 * server, where getServerSnapshot answers 0.
 */

let held = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Marks the page busy; call the returned function once to release it. Idempotent. */
export function holdPage(): () => void {
  held += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held -= 1;
    emit();
  };
}

export function subscribePageBusy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pageBusy(): boolean {
  return held > 0;
}

export function serverPageBusy(): boolean {
  return false;
}

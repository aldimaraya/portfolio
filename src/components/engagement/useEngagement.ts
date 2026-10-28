'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { LikeableKind } from '@/lib/engagement/kinds';

/**
 * Likes and views, asked of the server after hydration. The pages are static
 * and their HTML is shared by every visitor, so it cannot say whether *this*
 * visitor liked something — and a count baked into it would be stale from the
 * first click. Same shape as useIsAdmin: a store outside React, read through
 * useSyncExternalStore, with a server snapshot of "nothing known yet" so the
 * static HTML always hydrates cleanly.
 *
 * Held at module scope, so the margin's view count and the foot's like button
 * on one post share a single request, and a second visit to the same page in
 * one session asks again for nothing.
 */

export type Counts = { likes: number; views?: number; liked: boolean };

const counts = new Map<string, Counts>();
const listeners = new Set<() => void>();
/** Keys already asked for, so each is fetched once however many readers mount. */
const requested = new Set<string>();

/** A still with no likes is absent from the wall's answer; this is what it reads as. */
const NO_LIKES: Counts = { likes: 0, liked: false };
let wallLoaded = false;

/**
 * The wall's likes as first fetched, for the popular order — deliberately not
 * kept up to date. The lightbox tracks its photo by position on the wall, so a
 * wall that re-sorted as the visitor liked things would swap the photo out from
 * under the click. Undefined while asking; FAILED if the answer never came.
 */
const FAILED: Readonly<Record<string, number>> = Object.freeze({});
let wallOrder: Readonly<Record<string, number>> | undefined;

const keyOf = (kind: LikeableKind, id: string) => `${kind}:${id}`;

function publish(): void {
  for (const listener of listeners) listener();
}

function store(key: string, value: Counts): void {
  counts.set(key, value);
  publish();
}

async function request(url: string, body?: unknown): Promise<Counts | null> {
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.ok ? ((await response.json()) as Counts) : null;
  } catch {
    // A failed read leaves the numbers off, which is what the page looked like
    // before they arrived anyway — there is nothing useful to say about it.
    return null;
  }
}

/**
 * Every still at once: the lightbox steps from photo to photo faster than a
 * request per photo could keep up with. Asked for the first time the lightbox
 * opens or the wall is sorted by likes, not whenever the wall loads — most
 * visits to the wall do neither.
 */
async function loadWall(): Promise<void> {
  if (requested.has('stills')) return;
  requested.add('stills');

  try {
    const response = await fetch('/api/engagement?kind=stills');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const wall = (await response.json()) as { likes: Record<string, number>; liked: string[] };
    const liked = new Set(wall.liked);
    // A reload replaces the wall outright: a still that has dropped back to no
    // likes is absent from the answer, and would otherwise keep its old entry.
    for (const key of counts.keys()) if (key.startsWith('stills:')) counts.delete(key);
    for (const [id, likes] of Object.entries(wall.likes)) {
      counts.set(keyOf('stills', id), { likes, liked: liked.has(id) });
    }
    wallLoaded = true;
    wallOrder ??= wall.likes;
    publish();
  } catch {
    // As in request(): no numbers is the honest fallback — and for the popular
    // order, the wall falls back to newest first rather than waiting forever.
    wallOrder ??= FAILED;
    publish();
  }
}

/**
 * A clip or a post. `view` records the visit on the way: the page asks for its
 * counts exactly once, so asking is the visit. The server decides whether it
 * actually counts — see /api/engagement/view.
 */
async function loadItem(kind: LikeableKind, id: string, view: boolean): Promise<void> {
  const key = keyOf(kind, id);
  if (requested.has(key)) return;
  requested.add(key);

  const result = view
    ? await request('/api/engagement/view', { kind, id })
    : await request(`/api/engagement?kind=${kind}&id=${encodeURIComponent(id)}`);
  if (result) store(key, result);
  // Let a later mount try again rather than leaving the numbers off for good.
  else requested.delete(key);
}

/**
 * The like each item is being moved towards, while a request for it is in
 * flight. Clicks are not sent one per click: a request is out at most once per
 * item, and when it lands, whatever the visitor wants *now* is sent if it
 * differs. Two requests racing could otherwise land in the wrong order and
 * leave the heart showing one thing and the server holding the other.
 */
const wanted = new Map<string, boolean>();

async function sendLike(kind: LikeableKind, id: string): Promise<void> {
  const key = keyOf(kind, id);
  let confirmed: Counts | null = null;

  for (;;) {
    const liked = wanted.get(key);
    if (liked === undefined) break;
    const result = await request('/api/engagement/like', { kind, id, liked });
    if (!result) break;
    confirmed = result;
    if (wanted.get(key) === result.liked) break;
  }

  wanted.delete(key);
  if (confirmed) {
    store(key, confirmed);
    return;
  }
  // Refused or unreachable: put back what the server last said rather than
  // keep showing a like it never recorded.
  requested.delete(key);
  if (kind === 'stills') {
    requested.delete('stills');
    void loadWall();
  } else {
    void loadItem(kind, id, false);
  }
}

function toggle(kind: LikeableKind, id: string): void {
  const key = keyOf(kind, id);
  const current = counts.get(key) ?? (kind === 'stills' && wallLoaded ? NO_LIKES : undefined);
  // Nothing known yet means nothing to show a change against; the button is
  // disabled until the counts land, so this is only ever a race with that.
  if (!current) return;

  const liked = !current.liked;
  // Optimistic: the heart fills on the click, not a round trip later.
  store(key, { ...current, liked, likes: Math.max(0, current.likes + (liked ? 1 : -1)) });

  const inFlight = wanted.has(key);
  wanted.set(key, liked);
  if (!inFlight) void sendLike(kind, id);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * One item's counts, or undefined until they arrive. Pass `view` on the page
 * that *is* the item — a clip page, a post — and leave it off anywhere else.
 */
export function useEngagement(
  kind: LikeableKind,
  id: string,
  { view = false }: { view?: boolean } = {},
): { counts: Counts | undefined; toggleLike: () => void } {
  const subscribeAndLoad = useCallback(
    (onChange: () => void) => {
      const unsubscribe = subscribe(onChange);
      // Kicked off from here rather than from an effect, for useIsAdmin's
      // reason: a reader cannot miss the answer arriving between its render and
      // its subscription.
      if (kind === 'stills') void loadWall();
      else void loadItem(kind, id, view);
      return unsubscribe;
    },
    [kind, id, view],
  );

  const value = useSyncExternalStore(
    subscribeAndLoad,
    () => counts.get(keyOf(kind, id)) ?? (kind === 'stills' && wallLoaded ? NO_LIKES : undefined),
    () => undefined,
  );

  const toggleLike = useCallback(() => toggle(kind, id), [kind, id]);
  return { counts: value, toggleLike };
}

/**
 * Every still's likes, for sorting the wall by them — undefined until they
 * arrive, and only asked for while `enabled`, so the default wall never spends
 * the request. A failed request answers with no likes at all, which sorts as
 * newest first.
 */
export function useWallLikes(enabled: boolean): Readonly<Record<string, number>> | undefined {
  const subscribeAndLoad = useCallback(
    (onChange: () => void) => {
      const unsubscribe = subscribe(onChange);
      if (enabled) void loadWall();
      return unsubscribe;
    },
    [enabled],
  );

  return useSyncExternalStore(
    subscribeAndLoad,
    () => (enabled ? wallOrder : undefined),
    () => undefined,
  );
}

/**
 * Whether the lightbox's swipe demonstration has already played. Once per
 * browsing session, not per photo: someone who has watched the finger drag the
 * print once has learned it, and replaying it on every photo turns a lesson
 * into a toll. sessionStorage rather than localStorage so a visitor coming back
 * another day is shown again — the gesture is easy to forget between visits.
 *
 * Client-side only. A blocked store reads as "not seen", so the worst case is
 * the demonstration playing on every photo, as it used to.
 */

export const GESTURE_HINT_STORAGE_KEY = 'lightbox-gesture-hint';

export function gestureHintSeen(): boolean {
  try {
    return sessionStorage.getItem(GESTURE_HINT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function rememberGestureHint(): void {
  try {
    sessionStorage.setItem(GESTURE_HINT_STORAGE_KEY, 'seen');
  } catch {
    // Private mode or blocked storage: the hint plays again next time. Harmless.
  }
}

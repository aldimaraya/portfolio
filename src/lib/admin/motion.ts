import type { Slot } from '@/lib/video/board';

/**
 * The admin Motion board's pure half: what a search matches, and where ⌥↑/⌥↓
 * sends a clip. The drag itself is lib/video/board.ts.
 */

export interface SearchableClip {
  title: string;
  description: string;
  tags: string[];
}

/** Every word has to land somewhere — in the clip's own text or its roll's name. */
export function matchesClip(clip: SearchableClip, rollName: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [clip.title, clip.description, rollName, ...clip.tags].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * The gap a one-place nudge drops a clip into, in the Slot terms moveBetween
 * takes, or null when there is nowhere to go. Past either end of its roll it
 * crosses to the neighbouring roll — the end of the one above, the top of the
 * one below — so the keyboard can do everything a drag can. Lists with no roll
 * (`writable` false) are never landed on, only left.
 */
export function nudgeTarget(lengths: number[], writable: boolean[], from: Slot, delta: -1 | 1): Slot | null {
  const { group, index } = from;
  if (writable[group]) {
    // Gaps, not rows: one place down is the gap *below the next row*.
    if (delta === -1 && index > 0) return { group, index: index - 1 };
    if (delta === 1 && index < lengths[group] - 1) return { group, index: index + 2 };
  }
  for (let next = group + delta; next >= 0 && next < lengths.length; next += delta) {
    if (writable[next]) return { group: next, index: delta === -1 ? lengths[next] : 0 };
  }
  return null;
}

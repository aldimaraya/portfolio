/**
 * The admin's clip board: every roll's clips as one set of lists, so a drag can
 * carry a clip from one roll into another as well as along its own.
 */

export interface Slot {
  /** Which list — an index into the groups, not a roll id. */
  group: number;
  /**
   * For the item being dragged, its position. For a drop, the *gap* it goes
   * into, counted in the list as it stands before the move: 0 is above the first
   * row, the list's length is below the last. Gaps rather than rows because
   * where a drop lands is decided by which half of a row the pointer is over
   * (gapAt) — a row index alone cannot say "below this one".
   */
  index: number;
}

/** The gap a pointer over a row is pointing at: its top half, or its bottom. */
export function gapAt(row: number, pointerY: number, rowTop: number, rowHeight: number): number {
  return pointerY < rowTop + rowHeight / 2 ? row : row + 1;
}

/**
 * Moves one item into a gap, returning new arrays and leaving the input alone —
 * the caller keeps the old lists to put back if the save fails.
 */
export function moveBetween<T>(groups: T[][], from: Slot, to: Slot): T[][] {
  const next = groups.map((items) => [...items]);
  const [moved] = next[from.group].splice(from.index, 1);
  if (moved === undefined) return groups;

  // Taking the item out closes its gap, so every gap below it in the same list
  // moves up by one.
  const gap = from.group === to.group && to.index > from.index ? to.index - 1 : to.index;
  const target = next[to.group];
  target.splice(Math.min(Math.max(gap, 0), target.length), 0, moved);
  return next;
}

/** True when a drop would leave everything where it already is. */
export function isNoop(from: Slot, to: Slot): boolean {
  // The gaps directly above and below an item are both where it already is.
  return from.group === to.group && (to.index === from.index || to.index === from.index + 1);
}

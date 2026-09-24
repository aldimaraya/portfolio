/**
 * Rolls as the public reads them: the ordered rolls, each holding its ordered
 * clips, lettered by position.
 *
 * /motion and every /motion/[id] page build their numbering from this one
 * function, because a clip's frame code and its prev/next are a claim about the
 * whole page — if the two surfaces grouped differently, a clip labelled 03B on
 * the roll could open as 02A.
 */

export interface RollInfo {
  id: string;
  name: string;
  description: string;
}

export interface Lettered<C> extends RollInfo {
  letter: string;
  clips: C[];
}

/**
 * A, B, … Z, then AA, AB — the spreadsheet scheme, so a 27th roll still gets a
 * letter rather than an index nobody reads as film. Nothing here is that long;
 * the format should not be the reason it cannot be.
 */
export function rollLetter(index: number): string {
  let letter = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
  }
  return letter;
}

/** `01A`, `02A`, … `01B` — the frame numbering printed along a real strip. */
export function frameCode(index: number, letter = 'A'): string {
  return `${String(index + 1).padStart(2, '0')}${letter}`;
}

/**
 * Groups clips into their rolls. Both lists must arrive already sorted — rolls
 * by their own order, clips by theirs — since only the caller's query knows the
 * order, and sorting twice is how two surfaces drift.
 *
 * A clip with no roll is filed at the end of the first one rather than dropped.
 * Only rows older than rolls can be in that state (saveVideo requires one), and
 * a clip silently vanishing from /motion between the schema push and the
 * backfill is worse than one briefly sitting on the wrong roll. With no rolls
 * at all, they get an unnamed one of their own for the same reason.
 *
 * Empty rolls are left out, and lettering skips them: a heading with nothing
 * under it is noise, and a gap from A to C would read as a missing roll.
 */
export function groupIntoRolls<C extends { rollId: string | null }>(
  rolls: RollInfo[],
  clips: C[],
): Lettered<C>[] {
  const known = new Set(rolls.map((roll) => roll.id));
  const loose = clips.filter((clip) => !clip.rollId || !known.has(clip.rollId));

  const filled = rolls.map((roll, index) => ({
    ...roll,
    clips: [
      ...clips.filter((clip) => clip.rollId === roll.id),
      ...(index === 0 ? loose : []),
    ],
  }));
  if (rolls.length === 0 && loose.length > 0) {
    filled.push({ id: '', name: '', description: '', clips: loose });
  }

  return filled
    .filter((roll) => roll.clips.length > 0)
    .map((roll, index) => ({ ...roll, letter: rollLetter(index) }));
}

/**
 * Finds one clip on the grouped rolls: its roll, its place on it, and its
 * neighbours. Prev/next stop at the roll's ends — a roll is a sequence someone
 * chose, and running on into the next one would splice two of them together.
 */
export function locateClip<C extends { id: string; rollId: string | null }>(
  rolls: Lettered<C>[],
  id: string,
) {
  for (const roll of rolls) {
    const index = roll.clips.findIndex((clip) => clip.id === id);
    if (index === -1) continue;
    return {
      roll,
      clip: roll.clips[index],
      index,
      previous: roll.clips[index - 1] ?? null,
      next: roll.clips[index + 1] ?? null,
    };
  }
  return null;
}

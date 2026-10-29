'use client';

import { ClipRow, type RollClip } from '@/components/motion/ClipRow';
import { shuffle } from '@/lib/color/sort';
import { useVisitSeed } from './useVisitSeed';

export interface PlacedClip {
  clip: RollClip;
  /** Its place on its own roll, worked out on the server — see groupIntoRolls. */
  index: number;
  letter: string;
}

/**
 * A few clips dealt at random from every roll, as the roll's own rows minus the
 * rail: the perforations are the motion page's set piece, and a three-row stub of
 * them reads as a broken version of it rather than a preview.
 *
 * The prerendered HTML carries the first `count` in the order given, and the deal
 * replaces them straight after hydration. That swap is never seen: the rows are
 * all one height, so nothing moves, and the enclosing AssetGate holds them at
 * opacity 0 until the posters actually shown are in.
 */
export function ClipSample({ clips, count }: { clips: PlacedClip[]; count: number }) {
  const seed = useVisitSeed();
  const shown = (seed === null ? clips : shuffle(clips, seed)).slice(0, count);

  return (
    <ul>
      {shown.map(({ clip, index, letter }) => (
        <li key={clip.id} className="border-b border-hairline first:border-t">
          <ClipRow clip={clip} index={index} letter={letter} gated />
        </li>
      ))}
    </ul>
  );
}

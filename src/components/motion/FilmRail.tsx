/**
 * The film itself, reduced to a margin.
 *
 * The roll used to be the layout — a full-width strip the frames travelled
 * through. Here it is a 26px perforated edge running down the left of an
 * ordinary list, which is enough to say "film" without spending the page on it.
 *
 * Server-safe on purpose: the clip page draws the same rail beside a single clip
 * and has no reason to become a client component to do it.
 */

/** Height of one perforation cell. The transport in MotionRoll steps by this. */
export const PERFORATION_PITCH = 32;

export function FilmRail({
  ref,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>;
  /** The head of the mechanism, on the surface that has one. */
  children?: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      aria-hidden
      // Perforations as a repeating radial gradient rather than an asset: one
      // paint, and the transport only moves its position. The gradient lives in
      // globals.css so the offset can be a custom property with a default —
      // which is what leaves the rail correct before any script has run.
      className="film-rail w-[26px] shrink-0 border-x border-hairline bg-film max-strip:w-4"
      style={{ backgroundSize: `20px ${PERFORATION_PITCH}px` }}
    >
      {children}
    </div>
  );
}

/** `01A`, `02A`, … — the frame numbering printed along a real strip. */
export function frameCode(index: number): string {
  return `${String(index + 1).padStart(2, '0')}A`;
}

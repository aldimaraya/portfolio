/**
 * The wait, borrowed from the darkroom: a tray with light moving across it while
 * the images come up. Shared by every surface that holds its cascade for media —
 * the stills wall, the motion rolls, the home page — so a wait looks the same
 * wherever it happens.
 *
 * Placed where the first content will be, rather than centred in the viewport:
 * the indicator is replaced by content in the same spot, so the eye is already
 * looking at the right place when the cascade starts.
 *
 * Two placements. In flow (the wall's), where the content below has no settled
 * size yet and may as well be pushed down. `overlay`, where the content behind is
 * already laid out at its final size and held at opacity 0 — the loader floats
 * over its top instead of shoving it, so nothing jumps when it goes. The caller
 * provides the positioned ancestor.
 */
export function DevelopingLoader({ overlay = false }: { overlay?: boolean }) {
  return (
    <div
      // Not aria-live: the status is announced once by role="status" when it
      // appears, and the content that follows is the real page. A live region
      // here would announce a tray of chemicals as though it were the page.
      role="status"
      className={`developing-loader flex w-full flex-col items-center justify-center gap-4 py-24 ${
        overlay ? 'pointer-events-none absolute inset-x-0 top-0' : ''
      }`}
    >
      <div className="relative h-1 w-48 overflow-hidden rounded-full bg-hairline">
        <div className="develop-sweep h-full w-1/3 rounded-full bg-gold" />
      </div>
      <p className="font-mono text-xs tracking-[0.2em] text-ash uppercase">Developing</p>
    </div>
  );
}

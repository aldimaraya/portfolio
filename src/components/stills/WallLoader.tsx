/**
 * The wall's wait, borrowed from the darkroom: a tray with light moving across
 * it while the images come up.
 *
 * Sized and placed to sit where the first row of frames will be, rather than
 * centred in the viewport — the indicator is replaced by content in the same
 * spot, so the eye is already looking at the right place when the cascade
 * starts. It is not an overlay for the same reason: the wall behind it is held
 * at opacity 0 but still laid out, and covering it would mean drawing a box the
 * exact size of something already there.
 */
export function WallLoader() {
  return (
    <div
      // Not aria-live: the status is announced once by role="status" when it
      // appears, and the wall that follows is the real content. A live region
      // here would announce a tray of chemicals as though it were the page.
      role="status"
      className="flex w-full flex-col items-center justify-center gap-4 py-24"
    >
      <div className="relative h-1 w-48 overflow-hidden rounded-full bg-hairline">
        <div className="develop-sweep h-full w-1/3 rounded-full bg-gold" />
      </div>
      <p className="font-mono text-xs tracking-[0.2em] text-ash uppercase">Developing</p>
    </div>
  );
}

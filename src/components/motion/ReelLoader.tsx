/**
 * The reel threading up before it runs: two spools turning, with a length of
 * film between them.
 *
 * Drawn inside the strip rather than over the page, so the wait happens in the
 * projector gate where the frames themselves will appear. The spools use the
 * same ring-and-cross mark as the transport indicator above the strip — this is
 * the same mechanism, shown doing the one thing it does before there is anything
 * to transport.
 */
function Spool() {
  return (
    <div className="spool-spin relative h-10 w-10 rounded-full border-2 border-gold">
      <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-gold" />
      <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-gold" />
    </div>
  );
}

export function ReelLoader() {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col items-center justify-center gap-5"
    >
      <div className="flex items-center gap-5">
        <Spool />
        {/* The film between the spools: a flat strip with its own sprocket edge,
            so the pair reads as one threaded reel rather than two loose wheels. */}
        <div
          className="h-6 w-24 rounded-xs border-y border-goldline bg-film"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--color-ink) 40%, transparent 45%), radial-gradient(circle, var(--color-ink) 40%, transparent 45%)',
            backgroundPosition: 'center 3px, center calc(100% - 3px)',
            backgroundSize: '12px 6px',
            backgroundRepeat: 'repeat-x',
          }}
        />
        <Spool />
      </div>
      <p className="font-mono text-xs tracking-[0.2em] text-ash uppercase">Loading reel</p>
    </div>
  );
}

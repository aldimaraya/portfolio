/**
 * The policy for re-encoding a picked clip before upload: whether it is worth
 * doing at all, and what to aim at. The encoding itself lives in
 * ./transcode-client.ts, which drives WebCodecs through mediabunny.
 *
 * This exists because the encode used to be a manual `ffmpeg` step, enforced by
 * nothing but a warning in the picker. Forgetting it put a multi-gigabyte master
 * into a 10 GB bucket, and the only way back was to delete the clip and start
 * over — media cannot be replaced in place.
 *
 * The trigger is bitrate, not file size. Size alone cannot tell a fine
 * ten-minute clip from an unencoded twenty-second one; both land near 200 MB and
 * only one of them is a problem. Duration is what separates them, so that is
 * what the threshold is built on.
 *
 * Lossy and one-way, exactly as ./../photo/compress.ts is for stills: the
 * re-encoded file is what reaches R2, so keep masters offline.
 */

/**
 * Longest edge kept. 1080p is what the clips are graded and delivered at, and
 * the roll never displays one larger.
 */
export const TARGET_MAX_EDGE = 1920;

/**
 * Target video bitrate. The middle of the 5–8 Mbps band these clips were already
 * being encoded to by hand, so the automatic encode is not a quality change —
 * it is the same setting, applied reliably.
 */
export const TARGET_BITRATE = 6_000_000;

/** Target audio bitrate, only ever used when the audio has to be re-encoded. */
export const TARGET_AUDIO_BITRATE = 192_000;

/**
 * How far over target a clip may sit before it is worth re-encoding. A file
 * already at 6.5 Mbps is within the band it was aimed at, and running it through
 * a second generation to save a few percent costs more quality than it saves
 * bytes.
 */
export const BITRATE_TOLERANCE = 1.25;

export interface TargetSize {
  width: number;
  height: number;
}

export interface SourceStats {
  bytes: number;
  durationSeconds: number;
  width: number;
  height: number;
}

export interface TranscodePlan {
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  /** Which test fired, so the form can say why it is re-encoding. */
  reason: 'bitrate' | 'dimensions' | 'both';
}

/**
 * Average bitrate in bits per second, inferred from the container size. Counts
 * the audio track and container overhead too, so it reads slightly high — which
 * is the right way to be wrong for a threshold whose tolerance is 25%.
 *
 * Returns 0 for a clip of unknown duration rather than dividing by zero. That is
 * load-bearing: an unknown duration makes the bitrate test abstain instead of
 * firing on a number it made up.
 */
export function estimatedBitrate(bytes: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || !Number.isFinite(durationSeconds)) return 0;
  return (bytes * 8) / durationSeconds;
}

/**
 * Scales `width`×`height` so its longest edge is at most `maxEdge`, preserving
 * the aspect ratio and never upscaling — the same contract as `targetSize` in
 * ../photo/compress.ts.
 *
 * The difference, and the reason this is not that function, is that both edges
 * are rounded to even numbers: H.264 subsamples chroma 2×2, so an odd dimension
 * is not encodable and the encoder would either refuse it or quietly pad.
 */
export function videoTargetSize(
  width: number,
  height: number,
  maxEdge = TARGET_MAX_EDGE,
): TargetSize {
  const longest = Math.max(width, height);
  if (longest === 0) return { width, height };

  const scale = longest <= maxEdge ? 1 : maxEdge / longest;
  return {
    width: toEven(width * scale),
    height: toEven(height * scale),
  };
}

/** Rounds to the nearest even number, never below 2. */
function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Decides whether a picked clip is worth re-encoding, and to what. Returns null
 * when the file is already within target and should be uploaded untouched —
 * the same shape of pure, testable verdict as `keepsOriginal` in
 * ../photo/trim-client.ts.
 */
export function shouldTranscode({
  bytes,
  durationSeconds,
  width,
  height,
}: SourceStats): TranscodePlan | null {
  const target = videoTargetSize(width, height);
  const oversized = target.width !== width || target.height !== height;
  const overBitrate = estimatedBitrate(bytes, durationSeconds) > TARGET_BITRATE * BITRATE_TOLERANCE;

  if (!oversized && !overBitrate) return null;

  return {
    width: target.width,
    height: target.height,
    videoBitrate: TARGET_BITRATE,
    audioBitrate: TARGET_AUDIO_BITRATE,
    reason: oversized && overBitrate ? 'both' : oversized ? 'dimensions' : 'bitrate',
  };
}

/**
 * Whether this looks like a phone, and so should skip the re-encode entirely.
 *
 * Not squeamishness about the hardware — a modern phone encodes H.264 fine. It
 * is that the encoded file is buffered whole in memory before upload, at roughly
 * 45 MB per minute of output, which a phone will be killed for long before a
 * laptop notices. Add that iOS suspends background tabs, so switching apps
 * mid-encode loses the work with no way to resume, and that a phone's own
 * footage is the worst case anyway: 4K HEVC trips the threshold every time.
 *
 * `reportedMobile` is `navigator.userAgentData.mobile`, which is authoritative
 * where it exists (Chromium). Safari has no such hint, hence the string match.
 *
 * iPads are deliberately treated as desktop: iPadOS Safari has reported itself
 * as a Mac since iPadOS 13, so it cannot be told apart here — and an iPad has
 * both the memory and the encoder to be worth attempting, so the side this
 * imprecision falls on is the right one.
 */
export function isHandheld(userAgent: string, reportedMobile?: boolean): boolean {
  if (reportedMobile !== undefined) return reportedMobile;
  return /Android|iPhone|iPod|IEMobile|Windows Phone|BlackBerry/i.test(userAgent);
}

/** Swaps the extension for .mp4, since the bytes are no longer the original file. */
export function mp4Filename(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'clip'}.mp4`;
}

/** Megabytes to one decimal, for the "482.3 MB → 96.1 MB" readout in the form. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Bits per second as Mbps, for the form's account of why it did or did not
 * re-encode. Empty for an unknown bitrate, which has nothing to report.
 */
export function formatMbps(bitsPerSecond: number): string {
  if (bitsPerSecond <= 0) return '';
  return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
}

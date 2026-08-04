/**
 * Just enough MP4/QuickTime box parsing to recover a clip's running time from
 * the stored file.
 *
 * This exists only for scripts/backfill-durations.mjs, and only because
 * Video.durationSeconds was added after the clips were uploaded. It is not a
 * general video parser and must not become one: the pipeline's rule is that
 * derived data is computed in the browser at upload time, and the way to get a
 * duration is `HTMLMediaElement.duration` (see lib/video/sprite.ts), which is
 * what every clip uploaded from now on uses.
 *
 * Reading only the header boxes is what keeps this from being "server-side video
 * processing" in the sense the pipeline forbids: no frame is ever decoded, and
 * the caller fetches kilobytes rather than the clip.
 */

/** A box header: four bytes of size, four of type, both big-endian. */
export interface BoxHeader {
  type: string;
  /** Total size of the box, header included. */
  size: number;
  /** Where the box's payload starts, relative to the box. */
  headerSize: number;
}

const HEADER_BYTES = 8;
const LARGE_SIZE_BYTES = 8;

export function readBoxHeader(bytes: Uint8Array, offset = 0): BoxHeader | null {
  if (offset + HEADER_BYTES > bytes.length) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint32(offset);
  const type = String.fromCharCode(
    ...bytes.subarray(offset + 4, offset + HEADER_BYTES),
  );

  // A size of 1 means the real size is a 64-bit value after the type. Anything
  // past Number.MAX_SAFE_INTEGER is not a file we will ever be handed, but
  // reading the high word keeps a large mdat from being mistaken for a tiny box
  // and sending the walk into the middle of a frame.
  if (size === 1) {
    if (offset + HEADER_BYTES + LARGE_SIZE_BYTES > bytes.length) return null;
    const large = view.getBigUint64(offset + HEADER_BYTES);
    return { type, size: Number(large), headerSize: HEADER_BYTES + LARGE_SIZE_BYTES };
  }

  // 0 means "to the end of the file", which is legal for the last box. The
  // caller knows the file length and this parser does not, so it is reported as
  // a zero size for the caller to interpret rather than guessed at here.
  return { type, size, headerSize: HEADER_BYTES };
}

/**
 * The clip's length in seconds, read from the `mvhd` box inside a `moov`.
 *
 * Returns null rather than throwing on anything unexpected: this runs over files
 * uploaded long before it existed, and a clip it cannot read should be reported
 * and skipped, not treated as an error worth stopping a backfill for.
 */
export function readDurationFromMoov(moov: Uint8Array): number | null {
  const header = readBoxHeader(moov);
  if (!header || header.type !== 'moov') return null;

  // mvhd is required to be the first box in moov, but scanning rather than
  // assuming costs nothing and survives a file that puts it second.
  let offset = header.headerSize;
  while (offset < moov.length) {
    const child = readBoxHeader(moov, offset);
    if (!child || child.size < HEADER_BYTES) return null;

    if (child.type === 'mvhd') {
      return readMvhd(moov.subarray(offset + child.headerSize, offset + child.size));
    }
    offset += child.size;
  }

  return null;
}

/**
 * mvhd's payload: a version byte, three flag bytes, then timestamps whose width
 * depends on that version. Duration is expressed in timescale units per second —
 * commonly 600 or 90000, never assumed.
 */
function readMvhd(payload: Uint8Array): number | null {
  if (payload.length < 4) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const version = payload[0];

  let timescale: number;
  let duration: number;

  if (version === 1) {
    // 4 (version+flags) + 8 (created) + 8 (modified) = 20
    if (payload.length < 32) return null;
    timescale = view.getUint32(20);
    duration = Number(view.getBigUint64(24));
  } else {
    // 4 + 4 + 4 = 12
    if (payload.length < 20) return null;
    timescale = view.getUint32(12);
    duration = view.getUint32(16);
  }

  if (!timescale || !duration) return null;

  // 0xffffffff is the documented "unknown duration" marker in a v0 header, and
  // dividing it by a timescale yields a plausible-looking number of hours.
  if (version !== 1 && duration === 0xffffffff) return null;

  return duration / timescale;
}

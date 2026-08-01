/**
 * Reads which audio codec a picked clip carries, so the admin can be warned
 * before uploading one the browser will play silently.
 *
 * This exists because a QuickTime-native export (Final Cut, Photo Booth, screen
 * recordings) commonly writes *uncompressed PCM* audio into a .mov. The video
 * track is ordinary H.264 and plays fine, but no browser can decode a PCM audio
 * track, so the clip arrives on the site mute with an inert volume control —
 * silence that looks like a player bug rather than a bad encode.
 *
 * Detection is a container parse, not a decode: the codec is named in the file's
 * `stsd` box, so there is nothing to play and nothing to transcode. That keeps
 * the pipeline's "no ffmpeg anywhere" constraint intact — see sprite.ts.
 */

/**
 * Sample-entry formats browsers can actually decode in an MP4/MOV.
 *
 * Deliberately conservative. `ac-3`/`ec-3` are omitted: support is patchy enough
 * that promising playback would be worse than a warning the user can ignore.
 */
export const PLAYABLE_AUDIO_FORMATS = new Set(['mp4a', '.mp3', 'Opus']);

/** The formats actually seen in the wild here, named for the warning text. */
const FORMAT_NAMES: Record<string, string> = {
  sowt: 'uncompressed PCM',
  twos: 'uncompressed PCM',
  lpcm: 'uncompressed PCM',
  in24: 'uncompressed 24-bit PCM',
  in32: 'uncompressed 32-bit PCM',
  fl32: 'uncompressed 32-bit float PCM',
  fl64: 'uncompressed 64-bit float PCM',
  alac: 'Apple Lossless',
  ulaw: 'µ-law PCM',
  alaw: 'A-law PCM',
};

/** Boxes that hold child boxes rather than payload, on the path down to `stsd`. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

interface Box {
  type: string;
  /** First byte of the payload, past the size/type header. */
  body: number;
  /** One past the last byte of the box. */
  end: number;
}

function fourcc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Walks the boxes laid out between `start` and `end`.
 *
 * An ISO base-media box is a 32-bit big-endian size followed by a four-character
 * type. Two escapes exist: size 1 means the real size is a 64-bit value after
 * the type, and size 0 means the box runs to the end of the file.
 */
function* boxes(view: DataView, start: number, end: number): Generator<Box> {
  let offset = start;

  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = fourcc(view, offset + 4);
    let body = offset + 8;

    if (size === 1) {
      if (offset + 16 > end) return;
      // Split read: getBigUint64 would hand back a BigInt for a number that is
      // always well inside Number's safe range here.
      size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      body = offset + 16;
    } else if (size === 0) {
      size = end - offset;
    }

    // A box cannot be smaller than its own header; treat it as corrupt and stop
    // rather than looping forever on a zero-width box.
    if (size < 8) return;

    yield { type, body, end: Math.min(offset + size, end) };
    offset += size;
  }
}

/** Follows a box path such as `mdia/minf/stbl/stsd` from within `start`–`end`. */
function findBox(view: DataView, start: number, end: number, path: string[]): Box | null {
  for (const box of boxes(view, start, end)) {
    if (box.type !== path[0]) continue;
    if (path.length === 1) return box;
    if (!CONTAINERS.has(box.type)) continue;

    // Keep scanning on a miss: a file may hold more than one box of a type, and
    // only one of them need contain the rest of the path.
    const found = findBox(view, box.body, box.end, path.slice(1));
    if (found) return found;
  }

  return null;
}

/**
 * The sample-entry format of every audio track, in file order — `['mp4a']` for a
 * normal web encode, `['sowt']` for the QuickTime PCM case above.
 *
 * Empty means the file has no audio track at all, which is a legitimate silent
 * clip rather than a problem; see `describeAudioProblem`.
 */
export function findAudioFormats(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer);
  const moov = findBox(view, 0, buffer.byteLength, ['moov']);
  if (!moov) return [];

  const formats: string[] = [];

  for (const trak of boxes(view, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;

    // A track's handler is what makes it audio; the sample format alone would
    // force us to keep a list of every video fourcc just to exclude it.
    const hdlr = findBox(view, trak.body, trak.end, ['mdia', 'hdlr']);
    if (!hdlr || hdlr.body + 12 > hdlr.end) continue;
    // hdlr payload: 4 bytes version+flags, 4 pre_defined, then the handler type.
    if (fourcc(view, hdlr.body + 8) !== 'soun') continue;

    const stsd = findBox(view, trak.body, trak.end, ['mdia', 'minf', 'stbl', 'stsd']);
    if (!stsd || stsd.body + 8 > stsd.end) continue;

    // stsd payload: 4 bytes version+flags, 4 entry count, then sized entries
    // whose first field past the header is the format.
    const count = view.getUint32(stsd.body + 4);
    let offset = stsd.body + 8;

    for (let entry = 0; entry < count && offset + 8 <= stsd.end; entry++) {
      const size = view.getUint32(offset);
      formats.push(fourcc(view, offset + 4));
      if (size < 8) break;
      offset += size;
    }
  }

  return formats;
}

/**
 * A warning to show the admin, or null when the clip is fine to upload.
 *
 * A clip with no audio track passes: plenty of footage is deliberately silent,
 * and refusing it would be inventing a requirement the site does not have.
 */
export function describeAudioProblem(formats: string[]): string | null {
  if (formats.length === 0) return null;
  if (formats.some((format) => PLAYABLE_AUDIO_FORMATS.has(format))) return null;

  const [format] = formats;
  const name = FORMAT_NAMES[format] ?? `“${format}”`;

  return (
    `This clip's audio is ${name}, which browsers cannot decode — it will play ` +
    'silently with a dead volume control. Re-encode the audio to AAC first: ' +
    'ffmpeg -i in.mov -c:v copy -c:a aac -b:a 192k out.mp4'
  );
}

/**
 * Reads just the `moov` box out of a picked file.
 *
 * Only box headers are read while scanning, and `mdat` — which is essentially the
 * whole file — is skipped by arithmetic rather than loaded. That matters: clips
 * here run to hundreds of megabytes, and QuickTime often writes `moov` last, so
 * a naive read-to-find would pull the entire file into memory.
 */
async function readMoov(file: Blob): Promise<ArrayBuffer | null> {
  let offset = 0;

  while (offset + 8 <= file.size) {
    const header = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
    if (header.byteLength < 8) return null;

    let size = header.getUint32(0);
    const type = fourcc(header, 4);

    if (size === 1) {
      if (header.byteLength < 16) return null;
      size = header.getUint32(8) * 2 ** 32 + header.getUint32(12);
    } else if (size === 0) {
      size = file.size - offset;
    }

    if (size < 8) return null;
    if (type === 'moov') return file.slice(offset, offset + size).arrayBuffer();

    offset += size;
  }

  return null;
}

/**
 * Browser-side entry point: picks apart a chosen file and reports whether its
 * audio will survive the trip to the site. Returns null for anything it cannot
 * parse — an unreadable container is not evidence of a bad encode, and a false
 * warning on every upload would train the admin to ignore it.
 */
export async function inspectAudio(file: Blob): Promise<string | null> {
  try {
    const moov = await readMoov(file);
    if (!moov) return null;
    return describeAudioProblem(findAudioFormats(moov));
  } catch {
    return null;
  }
}

/**
 * The browser half of the pre-upload re-encode: reads a picked clip's shape, and
 * runs the encode that ./transcode.ts decided was worth doing.
 *
 * This is WebCodecs, which means the OS hardware encoder does the work — the
 * same reason ./sprite.ts can afford to decode eighteen frames locally. It is
 * still client-side: no ffmpeg, no wasm, and nothing about it touches the app
 * server, so the rule that media never passes through us survives intact.
 *
 * mediabunny is imported dynamically rather than at module scope. It is a ~500 kB
 * chunk of demuxer, muxer and codec registry, and nothing needs it until an admin
 * actually picks a clip; a static import would put all of it in the initial bundle
 * of every admin page that renders the video form.
 */

import {
  isHandheld,
  mp4Filename,
  type TranscodePlan,
} from './transcode';

/** The Chromium-only hint, absent in Safari and not in the DOM lib's types. */
interface UserAgentData {
  mobile?: boolean;
}

/**
 * Whether this device should re-encode at all. Reads the two signals and defers
 * to `isHandheld` for the actual rule, which is pure and therefore testable.
 *
 * Callers should check this *before* probing: a device that will not encode has
 * no use for the verdict, and skipping the probe means the ~500 kB media library
 * is never fetched on a phone's connection either.
 */
export function canTranscodeHere(): boolean {
  if (typeof navigator === 'undefined') return false;
  const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  return !isHandheld(navigator.userAgent, data?.mobile);
}

export interface VideoProbe {
  durationSeconds: number;
  width: number;
  height: number;
  /**
   * Whether this browser can decode the video track at all. False for ProRes and
   * friends, which is the whole reason this field exists: an undecodable clip has
   * to fall back to "encode it yourself" rather than hang halfway through a
   * conversion.
   */
  canDecode: boolean;
}

export interface TranscodeOptions {
  /** Fraction complete, 0–1, as mediabunny reports it. */
  onProgress?: (fraction: number) => void;
  /** Aborting cancels the conversion; the returned promise then rejects. */
  signal?: AbortSignal;
}

/** Thrown when the picked file has no video track we can read at all. */
export class UnreadableVideoError extends Error {}

/**
 * Reads duration, display dimensions and decodability without decoding a single
 * frame — mediabunny only pulls the container's header boxes, so this costs
 * kilobytes even on a clip of a few hundred megabytes.
 *
 * Display dimensions, not coded ones: a phone clip carries its rotation in
 * metadata, and the coded frame is the unrotated one. Planning against the coded
 * size would letterbox every portrait video.
 */
export async function probeVideo(file: File): Promise<VideoProbe> {
  const { Input, ALL_FORMATS, BlobSource } = await import('mediabunny');

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new UnreadableVideoError('That file has no video track.');

    const [durationSeconds, width, height, canDecode] = await Promise.all([
      track.computeDuration(),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.canDecode(),
    ]);

    return { durationSeconds, width, height, canDecode };
  } finally {
    input.dispose();
  }
}

/**
 * Re-encodes `file` to the plan, returning the encoded clip as a new File ready
 * for the same `uploadFile` path everything else takes.
 *
 * Returns the *original* file untouched if the encode came out no smaller. That
 * is the same guard `keepsOriginal` applies to photos: a second generation that
 * saves nothing is pure loss, and the honest answer is to keep the first.
 */
export async function transcodeVideo(
  file: File,
  plan: TranscodePlan,
  { onProgress, signal }: TranscodeOptions = {},
): Promise<File> {
  const {
    Input,
    ALL_FORMATS,
    BlobSource,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    Conversion,
    Quality,
  } = await import('mediabunny');

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  try {
    const output = new Output({
      // 'in-memory' buffers the whole file so the moov box can be written at the
      // front. That matters twice over: a clip whose moov is at the tail cannot
      // start playing until it has fully buffered, and ./mp4.ts recovers
      // durations by range-reading moov, which a tail placement turns into a
      // second round trip.
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: 'avc',
        width: plan.width,
        height: plan.height,
        fit: 'contain',
        quality: new Quality({ bitrate: plan.videoBitrate }),
        // Without this, mediabunny copies the encoded samples whenever the
        // source is already H.264 at the target size — which is exactly the
        // over-bitrate clip we are here to shrink. Quality alone does not force
        // a re-encode.
        forceTranscode: true,
      },
      audio: {
        // Deliberately *not* forced. Audio already in AAC is copied over
        // untouched, the same as `ffmpeg -c:a copy`; only the uncompressed PCM
        // that no browser can decode gets re-encoded — which quietly fixes the
        // silent-playback problem that ./audio.ts can currently only warn about.
        codec: 'aac',
        quality: new Quality({ bitrate: plan.audioBitrate }),
      },
    });

    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((track) => track.reason).join(', ');
      throw new Error(`This clip cannot be re-encoded in the browser${reasons ? ` (${reasons})` : ''}.`);
    }

    // A discarded track does *not* make a conversion invalid: mediabunny will
    // happily write a video-only file, because a video-only file is a valid
    // file. That is precisely how "clips play silently" gets back in — and this
    // browser has no AudioEncoder at all on iOS before Safari 26, so it is not
    // hypothetical. Refuse instead, and let the caller upload the original,
    // which is bigger but still has its sound.
    const droppedAudio = conversion.discardedTracks.find((entry) => entry.track.isAudioTrack());
    if (droppedAudio) {
      throw new Error(
        `the audio track could not be carried over (${droppedAudio.reason})`,
      );
    }

    if (onProgress) conversion.onProgress = (fraction) => onProgress(fraction);

    // Cancellation has to be wired to the conversion rather than raced against
    // it: abandoning the promise would leave the encoder running and the file
    // pinned in memory.
    const abort = () => void conversion.cancel();
    if (signal) {
      if (signal.aborted) await conversion.cancel();
      else signal.addEventListener('abort', abort, { once: true });
    }

    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener('abort', abort);
    }

    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The re-encode produced no output.');

    if (buffer.byteLength >= file.size) return file;

    return new File([buffer], mp4Filename(file.name), { type: 'video/mp4' });
  } finally {
    input.dispose();
  }
}

/**
 * True when the failure was an admin pressing Cancel rather than something
 * breaking. Matched by name rather than `instanceof`, so checking it does not
 * drag the whole library in through a second dynamic import.
 */
export function isCancellation(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'ConversionCanceledError';
}

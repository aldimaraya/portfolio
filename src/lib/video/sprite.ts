import {
  computeFrameTimestamps,
  DEFAULT_SPRITE_FRAMES,
  PREVIEW_WINDOW_SECONDS,
  windowSpan,
  windowStart,
} from './timestamps';

/**
 * Browser-only sprite-sheet generation. The browser already holds the video file
 * for upload, so it seeks to each timestamp, draws the frame to a canvas, and
 * tiles them into one wide strip — which keeps the "no server-side transcoding"
 * constraint intact (no ffmpeg anywhere).
 *
 * The first frame doubles as the poster when none is supplied separately.
 */

export interface SpriteResult {
  spriteBlob: Blob;
  posterBlob: Blob;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  /** The clip's own pixel dimensions, not the downscaled frame's. */
  videoWidth: number;
  videoHeight: number;
  durationSeconds: number;
  /**
   * Where in the clip the frames were taken from, after clamping. Reported so the
   * admin's window control can start from where the grab actually landed rather
   * than from where it was asked to.
   */
  startSeconds: number;
  /** How much of the clip those frames span. */
  windowSeconds: number;
}

/** How far through the grab we are, reported once per captured frame. */
export interface SpriteProgress {
  captured: number;
  total: number;
  /** Rounded 0–100, so callers can render it exactly as uploads already are. */
  percent: number;
}

export interface SpriteOptions {
  frameCount?: number;
  frameWidth?: number;
  /**
   * Where the preview window opens. Left out, it falls to the default guess a
   * fifth of the way in — see windowStart.
   */
  startSeconds?: number;
  /**
   * Called at 0 once the frame count is known, then after each frame lands.
   * Eighteen sequential seeks through a long clip is tens of seconds in which a
   * silent form is indistinguishable from a dead one.
   */
  onProgress?: (progress: SpriteProgress) => void;
}

/** Clamped, so a caller cannot be handed 105% by a miscount. */
export function spriteProgress(captured: number, total: number): SpriteProgress {
  const frames = Math.max(0, Math.trunc(total));
  const done = Math.min(Math.max(0, Math.trunc(captured)), frames);
  return {
    captured: done,
    total: frames,
    percent: frames === 0 ? 0 : Math.round((done / frames) * 100),
  };
}

/**
 * Budgets for the waits below. Both are far past any honest worst case on
 * purpose: a timeout that fires on a working clip is *worse* than the hang it
 * replaces, because it fails routinely on real uploads where the hang needs a
 * file the browser can demux but not decode.
 *
 * Metadata gets the larger share. A clip not written faststart keeps its moov
 * atom at the end, so the browser reads the whole blob before it can answer
 * `duration` — and on the regenerate path that blob is a few hundred megabytes
 * that were just downloaded and assembled in memory.
 *
 * A seek is bounded work by comparison: decode forward from the preceding
 * keyframe, at most one GOP. All eighteen land inside a 1.5s window, so every
 * seek after the first is a near-neighbour of a frame already decoded.
 */
export const METADATA_TIMEOUT_MS = 60_000;
export const SEEK_TIMEOUT_MS = 30_000;

/**
 * Frames were 320px wide and displayed around 820px — a 2.5x upscale, and the
 * other half of why previews looked poor. 480 covers the strip's frame at a
 * sensible density without pushing the sheet near a canvas limit: at 18 frames
 * this is 8640px wide, well inside the ~16384px browsers allow. Going much
 * denser or wider needs a grid sheet and 2D stepping rather than one strip.
 */
export const DEFAULT_SPRITE_FRAME_WIDTH = 480;

/**
 * Resolves on the first of `event` or an error, and rejects if neither arrives
 * inside the budget. The timeout is the whole point: a browser that accepts a
 * file and then simply never fires `seeked` used to leave the caller awaiting
 * forever, with the admin form stuck busy, no error on screen and nothing to
 * retry short of a reload that empties the fields.
 *
 * Exported for its own test — the seek loop around it needs a decoder jsdom
 * does not have.
 */
export function once(
  video: HTMLVideoElement,
  event: string,
  failure: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Declarations, not arrows: each of the three refers to the others, and to
    // the timer handle declared after them.
    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener(event, onDone);
      video.removeEventListener('error', onError);
    }
    function onDone() {
      cleanup();
      resolve();
    }
    function onError() {
      cleanup();
      reject(new Error(failure));
    }
    const timer = setTimeout(() => {
      cleanup();
      // Names the wait, since "could not seek to 4.20s" and "could not read
      // metadata" are different problems with different answers.
      reject(new Error(`${failure} — gave up after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    video.addEventListener(event, onDone);
    video.addEventListener('error', onError);
  });
}

/**
 * Seeking is asynchronous — assigning currentTime and drawing immediately would
 * capture whatever frame happened to be decoded, so each grab waits for `seeked`.
 */
async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const seeked = once(video, 'seeked', `Could not seek to ${time.toFixed(2)}s`, SEEK_TIMEOUT_MS);
  video.currentTime = time;
  await seeked;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas produced no image'))),
      type,
      quality,
    );
  });
}

export async function generateSpriteSheet(
  file: File,
  {
    frameCount = DEFAULT_SPRITE_FRAMES,
    frameWidth = DEFAULT_SPRITE_FRAME_WIDTH,
    startSeconds,
    onProgress,
  }: SpriteOptions = {},
): Promise<SpriteResult> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = objectUrl;
  // Muted + playsInline keeps mobile browsers willing to decode without a user
  // gesture; without it the seeks never resolve on iOS.
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  try {
    await once(video, 'loadedmetadata', 'Could not read video metadata', METADATA_TIMEOUT_MS);

    const timestamps = computeFrameTimestamps(
      video.duration,
      frameCount,
      PREVIEW_WINDOW_SECONDS,
      startSeconds,
    );
    if (timestamps.length === 0) {
      throw new Error('Video duration could not be determined');
    }
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Video dimensions could not be determined');
    }

    const frameHeight = Math.max(
      1,
      Math.round(frameWidth * (video.videoHeight / video.videoWidth)),
    );

    const sprite = document.createElement('canvas');
    sprite.width = frameWidth * timestamps.length;
    sprite.height = frameHeight;
    const spriteContext = sprite.getContext('2d');
    if (!spriteContext) throw new Error('Could not get a 2D canvas context');

    const poster = document.createElement('canvas');
    poster.width = frameWidth;
    poster.height = frameHeight;
    const posterContext = poster.getContext('2d');
    if (!posterContext) throw new Error('Could not get a 2D canvas context');

    onProgress?.(spriteProgress(0, timestamps.length));

    // Sequential, not Promise.all: a single <video> has one playhead, so parallel
    // seeks would race and every frame would come out identical.
    for (const [index, time] of timestamps.entries()) {
      await seekTo(video, time);
      spriteContext.drawImage(
        video,
        index * frameWidth,
        0,
        frameWidth,
        frameHeight,
      );
      if (index === 0) {
        posterContext.drawImage(video, 0, 0, frameWidth, frameHeight);
      }
      onProgress?.(spriteProgress(index + 1, timestamps.length));
    }

    const [spriteBlob, posterBlob] = await Promise.all([
      toBlob(sprite, 'image/webp', 0.8),
      toBlob(poster, 'image/webp', 0.85),
    ]);

    return {
      spriteBlob,
      posterBlob,
      frameCount: timestamps.length,
      frameWidth,
      frameHeight,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      durationSeconds: video.duration,
      startSeconds: windowStart(video.duration, PREVIEW_WINDOW_SECONDS, startSeconds),
      windowSeconds: windowSpan(video.duration),
    };
  } finally {
    // Releases the decoder and the object URL even when a seek throws; leaking
    // these pins the whole video file in memory.
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

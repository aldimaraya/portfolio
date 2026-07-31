import { computeFrameTimestamps, DEFAULT_SPRITE_FRAMES } from './timestamps';

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
  durationSeconds: number;
}

export const DEFAULT_SPRITE_FRAME_WIDTH = 320;

/** Resolves on the first of `event` or an error, whichever fires. */
function once(video: HTMLVideoElement, event: string, failure: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, onDone);
      video.removeEventListener('error', onError);
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(failure));
    };
    video.addEventListener(event, onDone);
    video.addEventListener('error', onError);
  });
}

/**
 * Seeking is asynchronous — assigning currentTime and drawing immediately would
 * capture whatever frame happened to be decoded, so each grab waits for `seeked`.
 */
async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const seeked = once(video, 'seeked', `Could not seek to ${time.toFixed(2)}s`);
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
  frameCount: number = DEFAULT_SPRITE_FRAMES,
  frameWidth: number = DEFAULT_SPRITE_FRAME_WIDTH,
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
    await once(video, 'loadedmetadata', 'Could not read video metadata');

    const timestamps = computeFrameTimestamps(video.duration, frameCount);
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
      durationSeconds: video.duration,
    };
  } finally {
    // Releases the decoder and the object URL even when a seek throws; leaking
    // these pins the whole video file in memory.
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

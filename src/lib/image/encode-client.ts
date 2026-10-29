/**
 * Canvas → image bytes, in the smallest format this browser can actually write.
 * Shared by the photo upload (lib/photo/trim-client.ts) and the clip previews
 * (lib/video/sprite.ts, lib/video/cover-client.ts), which all hit the same trap.
 */

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      type,
      quality,
    );
  });
}

/**
 * WebP where the browser can write it, JPEG where it cannot. Safari's canvas has
 * no WebP encoder and does not say so: asked for one, it hands back a lossless
 * PNG — 5 to 10 MB for a photo at full size, against about 1 MB of WebP — which
 * was then stored under a .webp name and content type. Big enough that the image
 * optimiser, which gives an upstream fetch seven seconds, timed out pulling them
 * on a slow line and the lightbox never got its photo; a clip's sprite strip came
 * out at 3–4 MB, fetched by every visitor who hovered it. JPEG at the same
 * quality is the smallest thing every browser can encode.
 *
 * Name the result after `blob.type` (see encodedFilename in lib/photo/compress),
 * never after what was asked for.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await canvasBlob(canvas, 'image/webp', quality);
  return webp.type === 'image/webp' ? webp : canvasBlob(canvas, 'image/jpeg', quality);
}

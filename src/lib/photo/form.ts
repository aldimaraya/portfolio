/**
 * Client-side completeness check for the photo form.
 *
 * This mirrors the required constraints in photoSchema (src/app/admin/photos/
 * actions.ts) but does not replace them — savePhoto still validates everything on
 * the server, since a server action is a publicly reachable endpoint. What this
 * buys is ordering: the form can refuse to start an upload it knows will be
 * rejected, so a half-filled form never leaves an orphaned object in R2.
 */

export interface PhotoDraft {
  /** A pending file selection or an already-stored URL both count. */
  hasImage: boolean;
  width: number;
  height: number;
  location: string;
  camera: string;
}

/**
 * What is still missing, phrased for the hint under the save button. An empty
 * array means the draft is ready to upload and save.
 */
export function missingRequiredFields(draft: PhotoDraft): string[] {
  const missing: string[] = [];

  if (!draft.hasImage) missing.push('a photo');
  if (!draft.location.trim()) missing.push('a location');
  if (!draft.camera.trim()) missing.push('a camera');

  // Dimensions are derived, not typed, so they are only worth reporting once an
  // image exists — a zero here means the colour analysis did not complete.
  if (draft.hasImage && (draft.width <= 0 || draft.height <= 0)) {
    missing.push('readable image dimensions');
  }

  return missing;
}

/**
 * Client-side completeness check for the video form — the counterpart to
 * src/lib/photo/form.ts, and subject to the same rule: saveVideo still validates
 * everything server-side. This exists so the form can refuse to start an upload
 * it knows will be rejected, which matters far more here than for photos, since
 * a clip can be hundreds of megabytes.
 */

export interface VideoDraft {
  /** A pending file selection or an already-stored URL both count. */
  hasVideo: boolean;
  /** Sprite and poster available, either freshly generated or already stored. */
  hasPreview: boolean;
  title: string;
}

export function missingRequiredFields(draft: VideoDraft): string[] {
  const missing: string[] = [];

  if (!draft.hasVideo) missing.push('a video');
  if (!draft.title.trim()) missing.push('a title');

  // Derived, not typed, so it is only worth reporting once a video exists.
  if (draft.hasVideo && !draft.hasPreview) {
    missing.push('a generated preview');
  }

  return missing;
}

/**
 * A sensible default title from the filename: drops the extension, turns
 * separators into spaces, and splits camelCase runs — so "BoracayEdit.mov"
 * offers "Boracay Edit" rather than making you retype it. Only ever a starting
 * point; the field stays editable.
 */
export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');

  return withoutExtension
    .replace(/[_-]+/g, ' ')
    // "BoracayEdit" -> "Boracay Edit", but "DSC" stays intact.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

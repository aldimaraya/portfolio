import { summarizeSettings, type PhotoSettings } from './settings';
import { formatTakenAt } from './date';

/** The fields a printed caption is built from — structural, so tests need no full row. */
export interface CaptionSource {
  title: string;
  location: string;
  camera: string;
  settings: PhotoSettings;
  takenAt: Date | null;
}

export interface PhotoCaption {
  /** The bold line: the title when there is one, the location when not. */
  heading: string;
  /** The small line under it. Carries the location once a title has taken its place. */
  meta: string;
  /**
   * What names the photo to a screen reader — alt text, aria labels. The title
   * alone would drop the place, which is often the only concrete thing a
   * sightless visitor gets told about the frame.
   */
  label: string;
}

/**
 * One source for the wall's polaroids and the lightbox mat, which used to build
 * their captions separately. A title is optional, and a photo without one must
 * read exactly as it did before titles existed — so the location is only ever
 * demoted into the meta line, never dropped.
 */
export function photoCaption(photo: CaptionSource): PhotoCaption {
  const title = photo.title.trim();
  const meta = [
    title ? photo.location : '',
    photo.camera,
    summarizeSettings(photo.settings),
    photo.takenAt ? formatTakenAt(photo.takenAt) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    heading: title || photo.location,
    meta,
    label: title ? `${title}, ${photo.location}` : photo.location,
  };
}

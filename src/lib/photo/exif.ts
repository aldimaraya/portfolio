import exifr from 'exifr';

/**
 * EXIF extraction, read in the browser from the file already in hand at upload
 * time. Same principle as the colour analysis: derive once on the client, store
 * the result, never recompute at render time.
 *
 * Everything here is best-effort. Scanned film usually carries no camera EXIF at
 * all (and when it does, it often describes the *scanner*), so callers must treat
 * every field as optional and only ever prefill — never overwrite what a human
 * typed.
 */

export interface PhotoExif {
  hasExif: boolean;
  camera?: string;
  lens?: string;
  capturedAt?: Date;
  iso?: number;
  aperture?: number;
  shutter?: string;
  focalLength?: number;
  coordinates?: string;
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Joins a make and model without stammering. EXIF makes are often padded out
 * ("NIKON CORPORATION" alongside model "NIKON D750"), so the make's first word is
 * what gets matched rather than the whole string.
 */
function joinMakeModel(rawMake?: string, rawModel?: string): string | undefined {
  const make = clean(rawMake);
  const model = clean(rawModel);

  if (!model) return make;
  if (!make) return model;

  const firstWord = make.split(/\s+/)[0].toLowerCase();
  if (model.toLowerCase().includes(firstWord)) return model;

  return `${make} ${model}`;
}

export function formatCamera(make?: string, model?: string): string | undefined {
  return joinMakeModel(make, model);
}

export function formatLens(lensMake?: string, lensModel?: string): string | undefined {
  return joinMakeModel(lensMake, lensModel);
}

/** Exposure time in seconds to the way photographers write it. */
export function formatShutter(exposureTime?: number): string | undefined {
  if (typeof exposureTime !== 'number' || !Number.isFinite(exposureTime)) return undefined;
  if (exposureTime <= 0) return undefined;
  if (exposureTime >= 1) return `${Number(exposureTime.toFixed(2))}s`;
  return `1/${Math.round(1 / exposureTime)}`;
}

/** Coordinates only — turning these into a place name would need a geocoder. */
export function formatCoordinates(
  latitude?: number,
  longitude?: number,
): string | undefined {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const round = (value: number) => Number(value.toFixed(5));
  return `${round(latitude)}, ${round(longitude)}`;
}

const NO_EXIF: PhotoExif = { hasExif: false };

export async function extractPhotoExif(file: File): Promise<PhotoExif> {
  let data: Record<string, unknown> | undefined;

  try {
    // `tiff` covers IFD0, where Make and Model live. `mergeOutput`
    // is exifr's default, but it is stated explicitly because the flat shape is
    // what the field reads below depend on — the GPS block contributes its
    // computed `latitude`/`longitude` only once merged.
    data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      mergeOutput: true,
    });
  } catch {
    // A file with no EXIF, or a malformed block, is not an error worth surfacing.
    return NO_EXIF;
  }

  if (!data) return NO_EXIF;

  const asNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const capturedAt =
    data.DateTimeOriginal instanceof Date && !Number.isNaN(data.DateTimeOriginal.getTime())
      ? data.DateTimeOriginal
      : undefined;

  return {
    hasExif: true,
    camera: formatCamera(clean(data.Make), clean(data.Model)),
    lens: formatLens(clean(data.LensMake), clean(data.LensModel)),
    capturedAt,
    iso: asNumber(data.ISO),
    aperture: asNumber(data.FNumber),
    shutter: formatShutter(asNumber(data.ExposureTime)),
    focalLength: asNumber(data.FocalLength),
    coordinates: formatCoordinates(asNumber(data.latitude), asNumber(data.longitude)),
  };
}

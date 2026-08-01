import { z } from 'zod';

/**
 * The camera settings for a shot, stored as one JSON column on Photo. Every value
 * is a free-text string so the admin can write them however reads best ("f/1.4",
 * "1/250", "Summilux 35mm") and so an EXIF-less upload can simply leave them
 * blank. Prefilled from EXIF at upload; see settingsFromExif.
 */
export const photoSettingsSchema = z.object({
  lens: z.string().default(''),
  focalLength: z.string().default(''),
  aperture: z.string().default(''),
  shutter: z.string().default(''),
  iso: z.string().default(''),
});

export type PhotoSettings = z.infer<typeof photoSettingsSchema>;

export const EMPTY_SETTINGS: PhotoSettings = {
  lens: '',
  focalLength: '',
  aperture: '',
  shutter: '',
  iso: '',
};

/** The subset of parsed EXIF that maps onto settings — kept structural so this
 *  module stays free of the exifr dependency. */
interface ExifSettingsSource {
  lens?: string;
  focalLength?: number;
  aperture?: number;
  shutter?: string;
  iso?: number;
}

/**
 * Maps parsed EXIF onto the editable settings shape, formatting each value the
 * way a photographer writes it. Anything EXIF didn't record stays blank.
 */
export function settingsFromExif(exif: ExifSettingsSource): PhotoSettings {
  return {
    lens: exif.lens ?? '',
    focalLength: exif.focalLength ? `${Math.round(exif.focalLength)}mm` : '',
    // Phones record the true aperture of the element, not the marked one
    // (2.798828125). One decimal is how it is written on the barrel: f/2.8.
    aperture: exif.aperture ? `f/${Number(exif.aperture.toFixed(1))}` : '',
    shutter: exif.shutter ?? '',
    iso: exif.iso ? String(exif.iso) : '',
  };
}

/**
 * One line for captions and admin lists: "Summilux 35mm · f/1.4 · 1/250 · ISO 400".
 * Blank fields are dropped, and the focal length is omitted when the lens name
 * already states it — "Summilux 35mm · 35mm" reads like a mistake.
 */
export function summarizeSettings(settings: PhotoSettings): string {
  const { lens, focalLength, aperture, shutter, iso } = settings;
  const redundantFocal =
    focalLength !== '' && lens.toLowerCase().includes(focalLength.toLowerCase());

  return [
    lens,
    redundantFocal ? '' : focalLength,
    aperture,
    shutter,
    iso ? `ISO ${iso}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Coerces the untyped Json column back into a PhotoSettings. Unknown or malformed
 * values (an old row, a hand-edited DB entry) fall back to all-blank rather than
 * throwing. The schema's per-field defaults fill in any missing keys.
 */
export function toSettings(value: unknown): PhotoSettings {
  const parsed = photoSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_SETTINGS;
}

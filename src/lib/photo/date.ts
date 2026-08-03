/**
 * Conversions for Photo.takenAt. Stored as UTC midnight of the calendar day the
 * photo was taken — never a real time of day — so a date survives round-tripping
 * through a plain `<input type="date">` without drifting by a day depending on
 * which timezone the browser or the render server happens to be in.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A date input's `"yyyy-mm-dd"` value → the UTC-midnight instant that gets
 * stored. Empty string means "unknown" — the admin cleared the field, or never
 * filled it in.
 */
export function inputValueToTakenAt(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

/**
 * A stored `takenAt` → a date input's value, read with UTC getters to match how
 * inputValueToTakenAt wrote it. Local getters here would shift the date by a day
 * in any timezone west of UTC.
 */
export function takenAtToInputValue(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * A freshly parsed EXIF `capturedAt` → a date input's value, for prefilling the
 * upload form. Read with *local* getters, deliberately unlike the function
 * above: EXIF's DateTimeOriginal carries no timezone of its own, so exifr builds
 * the Date from its raw components as-is, and the calendar day the camera's
 * clock actually showed is whatever the machine parsing it now calls "local".
 */
export function exifCapturedAtToInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * For public captions: month and year only, e.g. "MAR 2024". The wall cares
 * what season a photo belongs to, not which exact day — and day-level precision
 * would overstate how much this ever mattered for a phone snap or an old scan.
 */
export function formatTakenAt(date: Date): string {
  return date
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
}

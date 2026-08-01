/**
 * Pure pixel-colour analysis. Runs in the browser at upload time (see
 * analyze-image.ts); the results are stored on the Photo row so public page
 * rendering stays a cheap database read.
 */

export interface ColorStats {
  avgHue: number;
  avgSaturation: number;
  avgLightness: number;
  isMonochrome: boolean;
}

export const MONOCHROME_SATURATION_THRESHOLD = 0.12;

/**
 * Saturation for the placeholder below. The row stores hue and lightness but not
 * avgSaturation, so a colour photo gets one flat, deliberately muted value: the
 * placeholder only has to stop reading as a hole in the frame, and guessing high
 * would make a desaturated photo flash a vivid card before it loads.
 */
const PLACEHOLDER_SATURATION = 0.3;

/**
 * The photo's average colour, for the frame to sit on while the image loads.
 * Built from the stats already on the row, so it costs no extra bytes over the
 * wire and needs no blur data URL.
 */
export function placeholderColor(stats: {
  avgHue: number;
  avgLightness: number;
  isMonochrome: boolean;
}): string {
  const saturation = stats.isMonochrome ? 0 : PLACEHOLDER_SATURATION;
  const hue = Math.round(stats.avgHue);
  const lightness = Math.round(stats.avgLightness * 100);
  return `hsl(${hue} ${Math.round(saturation * 100)}% ${lightness}%)`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, lightness];

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue: number;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  return [hue * 60, saturation, lightness];
}

/**
 * Monochrome detection averages each pixel's own saturation rather than
 * measuring the saturation of the averaged colour. This matters: a red car
 * against a cyan sky averages to muddy grey, and testing that average would
 * wrongly file a vivid photo under black-and-white.
 */
export function analyzePixels(
  pixels: Uint8ClampedArray,
  threshold: number = MONOCHROME_SATURATION_THRESHOLD,
): ColorStats {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let satSum = 0;
  let count = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    satSum += rgbToHsl(r, g, b)[1];
    count += 1;
  }

  if (count === 0) {
    return { avgHue: 0, avgSaturation: 0, avgLightness: 0, isMonochrome: true };
  }

  const [avgHue, , avgLightness] = rgbToHsl(rSum / count, gSum / count, bSum / count);
  const avgSaturation = satSum / count;

  return {
    avgHue,
    avgSaturation,
    avgLightness,
    isMonochrome: avgSaturation < threshold,
  };
}

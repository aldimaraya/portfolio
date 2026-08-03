/**
 * Pure pixel-colour analysis. Runs in the browser at upload time (see
 * analyze-image.ts); the results are stored on the Photo row so public page
 * rendering stays a cheap database read.
 *
 * Everything here works in OKLab rather than HSL. HSL's "lightness" calls pure
 * yellow and pure blue both 50%, which made the dark→light monochrome band sort
 * against a value that does not match what the eye sees; OKLab's L does. Its
 * chroma is likewise a real "how colourful is this pixel" rather than a ratio
 * that spikes for anything near black or white.
 */

export interface ColorStats {
  /** Hue of the photo's average colour, in degrees. For the placeholder only —
   * see `warmth` for the value the wall actually sorts on. */
  avgHue: number;
  /** Chroma of the average colour, 0–~0.32. Low when the frame's colours cancel. */
  avgChroma: number;
  /** Mean OKLab L, 0–1. */
  avgLightness: number;
  /** Net cool→warm, roughly -0.1 (night blue) to +0.1 (golden hour). */
  warmth: number;
  isMonochrome: boolean;
}

/**
 * Below this reads as black-and-white. Far lower than an HSL saturation
 * threshold would be, because OKLab chroma is an absolute distance rather than a
 * ratio — and set this low deliberately. A true digital black-and-white is not
 * merely low chroma, it is *zero*: measured across the library, real B&W frames
 * sit at 0.0000–0.0001 while the most desaturated colour photos (a dusk skyline,
 * an overcast boat deck) still clear 0.019. Nothing lands in between, so the
 * threshold sits in the empty middle rather than near the colour photos, where a
 * higher value pulled muted-but-real colour into the monochrome band.
 */
export const MONOCHROME_CHROMA_THRESHOLD = 0.008;

/**
 * The hue treated as "warmest", in degrees. Warmth is the projection of the
 * average colour onto the axis through this hue and its opposite.
 *
 * 70° is a compromise, not a landmark. The coolest hue in OKLab is blue at ~264°,
 * which would argue for an axis at 84°; but red sits at 29° and is
 * unmistakably warm, which would argue for ~55°. Either extreme makes one end
 * of the axis read wrong — at 84° a red frame scores nearly neutral, at 55° blue
 * stops being the coldest thing on the wall. 70° keeps red, amber and yellow all
 * clearly warm while leaving blue the coldest point.
 */
const WARM_AXIS_DEGREES = 70;

/**
 * The photo's average colour, for the frame to sit on while the image loads.
 * Built from the stats already on the row, so it costs no extra bytes over the
 * wire and needs no blur data URL. Chroma is measured rather than guessed, so a
 * desaturated photo no longer flashes a vivid card before it loads — and a frame
 * whose colours cancel correctly resolves to the grey it actually averages to.
 */
export function placeholderColor(stats: {
  avgHue: number;
  avgChroma: number;
  avgLightness: number;
}): string {
  const lightness = stats.avgLightness.toFixed(3);
  const chroma = stats.avgChroma.toFixed(4);
  const hue = Math.round(stats.avgHue);
  return `oklch(${lightness} ${chroma} ${hue})`;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * sRGB to OKLab (Björn Ottosson). Returns [L, a, b] — Cartesian rather than
 * polar, because everything downstream averages these, and averaging a hue angle
 * is exactly the mistake this module exists to avoid.
 */
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Colour stats for one downsampled frame.
 *
 * The wall sorts on `warmth`, not on hue, because hue is the wrong question to
 * ask of documentary photography. Measured across this library, half to
 * two-thirds of a typical frame's colour cancels out — sky against land, cool
 * against warm — so asking "which hue is this photo" picks the winner of a very
 * close election and orders the wall by what amounts to noise. Warmth asks
 * something that stays meaningful when nothing dominates: the frame's net
 * position on one cool→warm axis, where a blue sky over an orange sunset lands
 * honestly in the middle instead of at an arbitrary point on a circle. It is
 * also linear, so it has no wraparound to get wrong.
 *
 * `isMonochrome` deliberately measures something else — RMS chroma, per pixel,
 * before any cancellation. A red car against a cyan sky averages to grey, and
 * testing the *average* would file a vivid photo under black-and-white.
 */
export function analyzePixels(
  pixels: Uint8ClampedArray,
  threshold: number = MONOCHROME_CHROMA_THRESHOLD,
): ColorStats {
  let aSum = 0;
  let bSum = 0;
  let lightnessSum = 0;
  let chromaSqSum = 0;
  let count = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const [L, a, b] = rgbToOklab(pixels[i], pixels[i + 1], pixels[i + 2]);
    aSum += a;
    bSum += b;
    lightnessSum += L;
    chromaSqSum += a * a + b * b;
    count += 1;
  }

  if (count === 0) {
    return { avgHue: 0, avgChroma: 0, avgLightness: 0, warmth: 0, isMonochrome: true };
  }

  const a = aSum / count;
  const b = bSum / count;
  const avgChroma = Math.hypot(a, b);

  // Below the monochrome threshold the average colour is grey and its angle is
  // rounding error, so report no hue rather than whichever direction the noise
  // happened to point. The placeholder paints grey either way.
  const avgHue =
    avgChroma < threshold ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

  const axis = (WARM_AXIS_DEGREES * Math.PI) / 180;

  return {
    avgHue,
    avgChroma,
    avgLightness: lightnessSum / count,
    warmth: a * Math.cos(axis) + b * Math.sin(axis),
    isMonochrome: Math.sqrt(chromaSqSum / count) < threshold,
  };
}

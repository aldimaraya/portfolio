import { describe, expect, it } from 'vitest';
import { keepsOriginal, type ReEncodeComparison } from '@/lib/photo/trim-client';
import { NO_BORDER } from '@/lib/photo/border';

/**
 * An untouched 2000×1500 pick whose WebP came out larger than the original, and
 * which carries no EXIF — a stripped web export, the case the size optimisation
 * was aimed at.
 */
const base: ReEncodeComparison = {
  insets: NO_BORDER,
  sourceWidth: 2000,
  sourceHeight: 1500,
  renderedWidth: 2000,
  renderedHeight: 1500,
  originalBytes: 400_000,
  renderedBytes: 460_000,
  originalHasMetadata: false,
};

describe('keepsOriginal', () => {
  it('keeps an already-optimised file that WebP would only make bigger', () => {
    expect(keepsOriginal(base)).toBe(true);
  });

  it('takes the re-encode when it is smaller', () => {
    expect(keepsOriginal({ ...base, renderedBytes: 120_000 })).toBe(false);
  });

  it('takes the re-encode when the image was downscaled', () => {
    expect(
      keepsOriginal({ ...base, renderedWidth: 2560, renderedHeight: 1920, sourceWidth: 8000, sourceHeight: 6000 }),
    ).toBe(false);
  });

  it('never keeps the original once a border has been cropped', () => {
    expect(
      keepsOriginal({ ...base, insets: { top: 40, right: 40, bottom: 60, left: 40 } }),
    ).toBe(false);
  });

  // The canvas round-trip is the only thing that strips EXIF, so a file with any
  // metadata has to be re-encoded however the byte comparison came out —
  // otherwise whether a photo's GPS coordinates are published to a public bucket
  // depends on which encoder happened to win.
  it('re-encodes a file carrying EXIF even when that costs bytes', () => {
    expect(keepsOriginal({ ...base, originalHasMetadata: true })).toBe(false);
  });
});

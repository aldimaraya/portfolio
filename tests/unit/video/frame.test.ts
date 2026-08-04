import { describe, expect, it } from 'vitest';
import {
  FRAME_FALLBACK_RATIO,
  frameRatio,
  gateStyles,
  isPortrait,
  thumbWidth,
} from '@/lib/video/frame';

describe('frameRatio', () => {
  it('uses the clip’s own dimensions', () => {
    expect(frameRatio({ width: 1920, height: 1080 })).toBeCloseTo(16 / 9);
    expect(frameRatio({ width: 1080, height: 1920 })).toBeCloseTo(9 / 16);
  });

  // Clips uploaded before width/height were stored carry zeroes, not nulls.
  it('falls back for a clip with no stored dimensions', () => {
    expect(frameRatio({ width: 0, height: 0 })).toBe(FRAME_FALLBACK_RATIO);
  });

  // A half-written row is as unusable as an empty one, and dividing by zero
  // here would put `Infinity` into an aspect-ratio.
  it('falls back when only one dimension is stored', () => {
    expect(frameRatio({ width: 1920, height: 0 })).toBe(FRAME_FALLBACK_RATIO);
    expect(frameRatio({ width: 0, height: 1080 })).toBe(FRAME_FALLBACK_RATIO);
  });
});

describe('isPortrait', () => {
  it('reads the shape, not the stored orientation', () => {
    expect(isPortrait({ width: 1080, height: 1920 })).toBe(true);
    expect(isPortrait({ width: 1920, height: 1080 })).toBe(false);
  });

  it('treats a square clip as landscape, so it is laid out full width', () => {
    expect(isPortrait({ width: 1000, height: 1000 })).toBe(false);
  });
});

describe('gateStyles', () => {
  it('gives the panel the ratio as a number for CSS to budget with', () => {
    // `.clip-gate` multiplies this by a length in calc(). A string would make
    // that invalid and silently drop the cap.
    expect(gateStyles(frameRatio({ width: 1080, height: 1920 })).panel).toEqual({
      '--frame-ratio': 9 / 16,
    });
    expect(gateStyles(frameRatio({ width: 1920, height: 1080 })).panel).toEqual({
      '--frame-ratio': 16 / 9,
    });
  });

  // The panel is taller than the frame by its slate and padding; shaping it to
  // the clip's ratio would squash the clip inside it by exactly that much.
  it('shapes the frame and never the panel', () => {
    const { panel, frame } = gateStyles(frameRatio({ width: 1920, height: 1080 }));
    expect(frame.aspectRatio).toBeCloseTo(16 / 9);
    expect(panel.aspectRatio).toBeUndefined();
  });

  // No max-height anywhere: clamping the height alone leaves the width at 100%
  // and re-stretches the frame. The cap is a max-width derived from the ratio.
  it('sets no height of its own', () => {
    const { panel, frame } = gateStyles(frameRatio({ width: 1920, height: 1080 }));
    for (const style of [panel, frame]) {
      expect(style.maxHeight).toBeUndefined();
      expect(style.height).toBeUndefined();
    }
  });
});

describe('thumbWidth', () => {
  // The row height is fixed; only the width moves. That is what keeps a
  // vertical clip from standing three times as tall as its neighbours.
  it('derives width from the ratio at a fixed row height', () => {
    expect(thumbWidth({ width: 1920, height: 1080 }, 72)).toBe(128);
    expect(thumbWidth({ width: 1080, height: 1920 }, 72)).toBe(41);
  });

  it('shapes an undimensioned clip like a 16:9 one', () => {
    expect(thumbWidth({ width: 0, height: 0 }, 72)).toBe(128);
  });
});

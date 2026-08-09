import { describe, it, expect } from 'vitest';
import {
  BITRATE_TOLERANCE,
  estimatedBitrate,
  formatMbps,
  isHandheld,
  formatMegabytes,
  mp4Filename,
  shouldTranscode,
  TARGET_BITRATE,
  TARGET_MAX_EDGE,
  videoTargetSize,
} from '@/lib/video/transcode';

/** Bytes a clip of `seconds` would occupy at `bitrate` bits per second. */
function bytesAt(bitrate: number, seconds: number): number {
  return (bitrate * seconds) / 8;
}

describe('estimatedBitrate', () => {
  it('converts bytes over duration into bits per second', () => {
    expect(estimatedBitrate(bytesAt(6_000_000, 10), 10)).toBeCloseTo(6_000_000);
  });

  it('abstains on an unknown duration rather than dividing by zero', () => {
    // The schema tolerates a duration of 0, and a made-up bitrate would either
    // re-encode every such clip or none of them.
    expect(estimatedBitrate(500_000_000, 0)).toBe(0);
    expect(estimatedBitrate(500_000_000, -1)).toBe(0);
    expect(estimatedBitrate(500_000_000, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('videoTargetSize', () => {
  it('scales the longest edge down to the cap', () => {
    expect(videoTargetSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
  });

  it('caps the long edge of a portrait clip, not its width', () => {
    expect(videoTargetSize(2160, 3840)).toEqual({ width: 1080, height: 1920 });
  });

  it('never upscales', () => {
    expect(videoTargetSize(1280, 720)).toEqual({ width: 1280, height: 720 });
  });

  it('rounds both edges to even numbers for chroma subsampling', () => {
    // 1080/1439*1920 lands on a fraction; H.264 cannot encode an odd edge.
    const result = videoTargetSize(2878, 1439);
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
  });

  it('leaves a clip already at the cap alone', () => {
    expect(videoTargetSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('survives unknown dimensions', () => {
    expect(videoTargetSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('shouldTranscode', () => {
  it('leaves a clip already at target untouched', () => {
    expect(
      shouldTranscode({
        bytes: bytesAt(TARGET_BITRATE, 60),
        durationSeconds: 60,
        width: 1920,
        height: 1080,
      }),
    ).toBeNull();
  });

  it('tolerates a clip a little over target rather than costing it a generation', () => {
    const bitrate = TARGET_BITRATE * (BITRATE_TOLERANCE - 0.05);
    expect(
      shouldTranscode({
        bytes: bytesAt(bitrate, 60),
        durationSeconds: 60,
        width: 1920,
        height: 1080,
      }),
    ).toBeNull();
  });

  it('fires on an over-bitrate clip that is already 1080p', () => {
    const plan = shouldTranscode({
      bytes: bytesAt(40_000_000, 60),
      durationSeconds: 60,
      width: 1920,
      height: 1080,
    });
    expect(plan).not.toBeNull();
    expect(plan?.reason).toBe('bitrate');
    // Nothing to resize; the point of this one is purely the bitrate.
    expect(plan).toMatchObject({ width: 1920, height: 1080, videoBitrate: TARGET_BITRATE });
  });

  it('fires on an oversized clip even when its bitrate is already modest', () => {
    const plan = shouldTranscode({
      bytes: bytesAt(4_000_000, 60),
      durationSeconds: 60,
      width: 3840,
      height: 2160,
    });
    expect(plan?.reason).toBe('dimensions');
    expect(plan).toMatchObject({ width: 1920, height: 1080 });
  });

  it('reports both when a master is oversized and over-bitrate', () => {
    const plan = shouldTranscode({
      bytes: bytesAt(80_000_000, 60),
      durationSeconds: 60,
      width: 3840,
      height: 2160,
    });
    expect(plan?.reason).toBe('both');
  });

  // The pair a size-only threshold gets wrong: same 400 MB file, and only the
  // duration says which of them is a problem.
  it('does not re-encode a long clip that merely happens to be large', () => {
    // Ten minutes of it, so ~5.6 Mbps — under target despite the size.
    expect(
      shouldTranscode({
        bytes: 400 * 1024 * 1024,
        durationSeconds: 600,
        width: 1920,
        height: 1080,
      }),
    ).toBeNull();
  });

  it('does re-encode a short clip of the same size', () => {
    // Twenty seconds of it, so ~168 Mbps — an unencoded master.
    expect(
      shouldTranscode({
        bytes: 400 * 1024 * 1024,
        durationSeconds: 20,
        width: 1920,
        height: 1080,
      }),
    ).not.toBeNull();
  });

  it('falls back to the dimension test when the duration is unknown', () => {
    // No duration means no trustworthy bitrate, so only the size test can speak.
    expect(
      shouldTranscode({
        bytes: 900 * 1024 * 1024,
        durationSeconds: 0,
        width: 1920,
        height: 1080,
      }),
    ).toBeNull();
    expect(
      shouldTranscode({
        bytes: 900 * 1024 * 1024,
        durationSeconds: 0,
        width: 3840,
        height: 2160,
      }),
    ).not.toBeNull();
  });

  it('plans no edge longer than the cap', () => {
    const plan = shouldTranscode({
      bytes: bytesAt(50_000_000, 30),
      durationSeconds: 30,
      width: 4096,
      height: 2160,
    });
    expect(Math.max(plan!.width, plan!.height)).toBeLessThanOrEqual(TARGET_MAX_EDGE);
  });
});

describe('mp4Filename', () => {
  it('swaps the extension, since the bytes are no longer the original', () => {
    expect(mp4Filename('blue-hour.mov')).toBe('blue-hour.mp4');
    expect(mp4Filename('clip.MP4')).toBe('clip.mp4');
  });

  it('adds an extension to a name that has none', () => {
    expect(mp4Filename('untitled')).toBe('untitled.mp4');
  });

  it('does not mistake a directory dot for an extension', () => {
    expect(mp4Filename('a.b/clip')).toBe('a.b/clip.mp4');
  });

  it('falls back on an empty name', () => {
    expect(mp4Filename('')).toBe('clip.mp4');
  });
});

describe('isHandheld', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const IPAD =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  it('trusts the client hint over the user-agent string when it is there', () => {
    // Chromium reports this directly, and it is not guesswork.
    expect(isHandheld(MAC, true)).toBe(true);
    expect(isHandheld(ANDROID, false)).toBe(false);
  });

  it('falls back to the user agent where no hint exists, as in Safari', () => {
    expect(isHandheld(IPHONE)).toBe(true);
    expect(isHandheld(ANDROID)).toBe(true);
  });

  it('treats a desktop browser as able to encode', () => {
    expect(isHandheld(MAC)).toBe(false);
  });

  it('treats an iPad as desktop, which is the side to err on', () => {
    // iPadOS Safari has claimed to be a Mac since iPadOS 13, so it cannot be
    // told apart here — and an iPad has the memory and the encoder to try.
    expect(isHandheld(IPAD)).toBe(false);
  });
});

describe('formatMegabytes', () => {
  it('reports megabytes to one decimal', () => {
    expect(formatMegabytes(100 * 1024 * 1024)).toBe('100.0 MB');
  });
});

describe('formatMbps', () => {
  it('reports megabits per second to one decimal', () => {
    expect(formatMbps(6_000_000)).toBe('6.0 Mbps');
  });

  it('says nothing about a bitrate it does not know', () => {
    // estimatedBitrate returns 0 for an unknown duration, and "0.0 Mbps" would
    // be a claim rather than an absence.
    expect(formatMbps(0)).toBe('');
  });
});

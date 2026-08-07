import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  METADATA_TIMEOUT_MS,
  SEEK_TIMEOUT_MS,
  once,
  spriteProgress,
} from '@/lib/video/sprite';

// The seek loop itself is not covered here: it needs a real decoder to fire
// `seeked`, which jsdom does not have. Only the two pieces that hold no video
// state are pinned.

describe('spriteProgress', () => {
  it('reports a percentage of the frames captured', () => {
    expect(spriteProgress(9, 18)).toEqual({ captured: 9, total: 18, percent: 50 });
  });

  it('starts at zero and ends at a hundred', () => {
    expect(spriteProgress(0, 18).percent).toBe(0);
    expect(spriteProgress(18, 18).percent).toBe(100);
  });

  it('rounds rather than reporting fractional percentages', () => {
    expect(spriteProgress(1, 18).percent).toBe(6);
  });

  it('never exceeds the total or falls below zero', () => {
    expect(spriteProgress(20, 18)).toEqual({ captured: 18, total: 18, percent: 100 });
    expect(spriteProgress(-1, 18)).toEqual({ captured: 0, total: 18, percent: 0 });
  });

  it('does not divide by a zero frame count', () => {
    expect(spriteProgress(0, 0)).toEqual({ captured: 0, total: 0, percent: 0 });
  });
});

describe('once', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when the event fires', async () => {
    const video = document.createElement('video');
    const waited = once(video, 'seeked', 'Could not seek', 1000);
    video.dispatchEvent(new Event('seeked'));
    await expect(waited).resolves.toBeUndefined();
  });

  it('rejects with the failure message on an error event', async () => {
    const video = document.createElement('video');
    const waited = once(video, 'seeked', 'Could not seek to 4.20s', 1000);
    video.dispatchEvent(new Event('error'));
    await expect(waited).rejects.toThrow('Could not seek to 4.20s');
  });

  it('rejects once the budget passes with neither event', async () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const waited = once(video, 'seeked', 'Could not seek to 4.20s', 30_000);
    const settled = expect(waited).rejects.toThrow('Could not seek to 4.20s — gave up after 30s');
    await vi.advanceTimersByTimeAsync(30_000);
    await settled;
  });

  it('does not fire the timeout after the event has resolved it', async () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const waited = once(video, 'loadedmetadata', 'Could not read video metadata', 1000);
    video.dispatchEvent(new Event('loadedmetadata'));
    await waited;
    // An uncleared timer would reject an already-settled promise, which is
    // silent here but an unhandled rejection in a browser.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops listening once it has settled', async () => {
    const video = document.createElement('video');
    const remove = vi.spyOn(video, 'removeEventListener');
    const waited = once(video, 'seeked', 'Could not seek', 1000);
    video.dispatchEvent(new Event('seeked'));
    await waited;
    expect(remove).toHaveBeenCalledWith('seeked', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('error', expect.any(Function));
  });
});

describe('timeout budgets', () => {
  it('gives metadata more room than a seek', () => {
    // Metadata may have to read the whole blob (moov atom last); a seek decodes
    // at most one GOP.
    expect(METADATA_TIMEOUT_MS).toBeGreaterThan(SEEK_TIMEOUT_MS);
  });

  it('leaves a slow 4K seek far more time than it needs', () => {
    expect(SEEK_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });
});

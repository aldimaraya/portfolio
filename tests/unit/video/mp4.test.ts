import { describe, expect, it } from 'vitest';
import { readBoxHeader, readDurationFromMoov } from '@/lib/video/mp4';

function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set([...type].map((c) => c.charCodeAt(0)), 4);
  bytes.set(payload, 8);
  return bytes;
}

/** A v0 mvhd payload: version+flags, created, modified, timescale, duration. */
function mvhdV0(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  payload[0] = 0;
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return payload;
}

function mvhdV1(timescale: number, duration: bigint): Uint8Array {
  const payload = new Uint8Array(112);
  const view = new DataView(payload.buffer);
  payload[0] = 1;
  view.setUint32(20, timescale);
  view.setBigUint64(24, duration);
  return payload;
}

describe('readBoxHeader', () => {
  it('reads a size and a four-character type', () => {
    expect(readBoxHeader(box('moov', new Uint8Array(4)))).toEqual({
      type: 'moov',
      size: 12,
      headerSize: 8,
    });
  });

  // A size of 1 means the real one is a 64-bit value after the type. Missing
  // this sends the walk into the middle of a large mdat.
  it('reads a 64-bit size when the 32-bit field says 1', () => {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 1);
    bytes.set([...'mdat'].map((c) => c.charCodeAt(0)), 4);
    view.setBigUint64(8, BigInt(5_000_000_000));

    expect(readBoxHeader(bytes)).toEqual({
      type: 'mdat',
      size: 5_000_000_000,
      headerSize: 16,
    });
  });

  it('returns null rather than reading past the end of a short buffer', () => {
    expect(readBoxHeader(new Uint8Array(4))).toBeNull();
    expect(readBoxHeader(box('moov', new Uint8Array(4)), 8)).toBeNull();
  });
});

describe('readDurationFromMoov', () => {
  it('converts duration by the file’s own timescale', () => {
    const moov = box('moov', box('mvhd', mvhdV0(600, 43_200)));
    expect(readDurationFromMoov(moov)).toBeCloseTo(72);
  });

  it('reads a 64-bit v1 header', () => {
    const moov = box('moov', box('mvhd', mvhdV1(90_000, BigInt(6_480_000))));
    expect(readDurationFromMoov(moov)).toBeCloseTo(72);
  });

  it('finds mvhd even when it is not the first child', () => {
    const moov = box('moov', new Uint8Array([
      ...box('free', new Uint8Array(8)),
      ...box('mvhd', mvhdV0(600, 43_200)),
    ]));
    expect(readDurationFromMoov(moov)).toBeCloseTo(72);
  });

  // The documented "unknown" marker. Dividing it out yields a plausible-looking
  // number of hours, which is the failure worth guarding.
  it('treats the v0 unknown-duration marker as unknown', () => {
    const moov = box('moov', box('mvhd', mvhdV0(600, 0xffffffff)));
    expect(readDurationFromMoov(moov)).toBeNull();
  });

  it('reports anything it cannot read as unknown rather than throwing', () => {
    expect(readDurationFromMoov(box('ftyp', new Uint8Array(8)))).toBeNull();
    expect(readDurationFromMoov(box('moov', new Uint8Array(4)))).toBeNull();
    expect(readDurationFromMoov(box('moov', box('mvhd', new Uint8Array(2))))).toBeNull();
    expect(readDurationFromMoov(box('moov', box('mvhd', mvhdV0(0, 43_200))))).toBeNull();
  });
});

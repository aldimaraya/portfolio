import { describe, it, expect } from 'vitest';
import {
  describeAudioProblem,
  findAudioFormats,
  inspectAudio,
  PLAYABLE_AUDIO_FORMATS,
} from '@/lib/video/audio';

/** Builds one ISO base-media box: 32-bit size, four-character type, payload. */
function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  return bytes;
}

/** Copies into a fresh buffer: `bytes.buffer` is typed as possibly shared. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** `hdlr` payload: version+flags, pre_defined, then the handler type. */
function hdlr(handler: string): Uint8Array {
  return box('hdlr', concat(new Uint8Array(8), new TextEncoder().encode(handler)));
}

/** `stsd` payload: version+flags, entry count, then one sample entry per format. */
function stsd(...formats: string[]): Uint8Array {
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(4, formats.length);
  // A bare 8-byte entry is shorter than a real sample entry, but the parser only
  // reads the size and the format, and steps by the size it is given.
  const entries = formats.map((format) => box(format, new Uint8Array(0)));
  return box('stsd', concat(header, ...entries));
}

function track(handler: string, ...formats: string[]): Uint8Array {
  return box(
    'trak',
    box('mdia', concat(hdlr(handler), box('minf', box('stbl', stsd(...formats))))),
  );
}

function file(...traks: Uint8Array[]): ArrayBuffer {
  // A leading `ftyp` and a `mdat` stand in for the boxes a real file interleaves
  // around `moov`, so the walk has to skip rather than assume moov comes first.
  const bytes = concat(
    box('ftyp', new TextEncoder().encode('qt  ')),
    box('mdat', new Uint8Array(64)),
    box('moov', concat(...traks)),
  );
  return toArrayBuffer(bytes);
}

describe('findAudioFormats', () => {
  it('reads the sample format of an audio track', () => {
    expect(findAudioFormats(file(track('soun', 'mp4a')))).toEqual(['mp4a']);
  });

  it('finds moov even when it follows the media data', () => {
    // QuickTime commonly writes moov last, which is why the scan cannot stop at
    // the first box it does not recognise.
    expect(findAudioFormats(file(track('soun', 'sowt')))).toEqual(['sowt']);
  });

  it('ignores video tracks', () => {
    const formats = findAudioFormats(file(track('vide', 'avc1'), track('soun', 'mp4a')));
    expect(formats).toEqual(['mp4a']);
  });

  it('ignores non-media tracks such as the timecode track', () => {
    // All three real clips carry a `tmcd` track alongside the picture and sound.
    const formats = findAudioFormats(file(track('vide', 'avc1'), track('tmcd', 'tmcd')));
    expect(formats).toEqual([]);
  });

  it('reports every audio track', () => {
    const formats = findAudioFormats(file(track('soun', 'mp4a'), track('soun', 'sowt')));
    expect(formats).toEqual(['mp4a', 'sowt']);
  });

  it('returns nothing for a file with no audio track', () => {
    expect(findAudioFormats(file(track('vide', 'avc1')))).toEqual([]);
  });

  it('returns nothing rather than throwing on a file with no moov', () => {
    const bytes = box('ftyp', new TextEncoder().encode('qt  '));
    expect(findAudioFormats(toArrayBuffer(bytes))).toEqual([]);
  });

  it('stops rather than looping on a zero-width box', () => {
    // A size of 0 past the header would otherwise never advance the offset.
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode('moov'), 4);
    expect(findAudioFormats(toArrayBuffer(bytes))).toEqual([]);
  });
});

describe('describeAudioProblem', () => {
  it('passes a normal AAC encode', () => {
    expect(describeAudioProblem(['mp4a'])).toBeNull();
  });

  it('passes a clip with no audio track, which is legitimately silent', () => {
    expect(describeAudioProblem([])).toBeNull();
  });

  it('names uncompressed PCM, the case that caused the silent clips', () => {
    const problem = describeAudioProblem(['sowt']);
    expect(problem).toContain('uncompressed PCM');
    expect(problem).toContain('aac');
  });

  it('quotes a format it has no friendly name for', () => {
    expect(describeAudioProblem(['xyz!'])).toContain('xyz!');
  });

  it('passes when any one track is playable', () => {
    // A dual-track export is fine as long as the browser can decode one of them.
    expect(describeAudioProblem(['sowt', 'mp4a'])).toBeNull();
  });

  it('agrees with the exported set of playable formats', () => {
    for (const format of PLAYABLE_AUDIO_FORMATS) {
      expect(describeAudioProblem([format])).toBeNull();
    }
  });
});

describe('inspectAudio', () => {
  it('warns about a PCM clip without reading past the moov box', async () => {
    const buffer = file(track('soun', 'sowt'));
    expect(await inspectAudio(new Blob([buffer]))).toContain('uncompressed PCM');
  });

  it('passes an AAC clip', async () => {
    expect(await inspectAudio(new Blob([file(track('soun', 'mp4a'))]))).toBeNull();
  });

  it('stays quiet on a file it cannot parse', async () => {
    // Silence beats a warning on every upload, which would train the admin to
    // click past the real one.
    expect(await inspectAudio(new Blob([new Uint8Array(32)]))).toBeNull();
  });

  it('stays quiet on an empty file', async () => {
    expect(await inspectAudio(new Blob([]))).toBeNull();
  });
});

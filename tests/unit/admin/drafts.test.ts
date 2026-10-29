import { describe, expect, it } from 'vitest';
import {
  applyBulk,
  inFlight,
  itemPercent,
  kindOfFile,
  needsDate,
  publishProblems,
  queueProgress,
  sending,
  tallyQueue,
  youtubeIdOf,
  type ClipFields,
  type StillFields,
} from '@/lib/admin/drafts';
import { EMPTY_SETTINGS } from '@/lib/photo/settings';

const still = (patch: Partial<StillFields> = {}): StillFields => ({
  title: '',
  location: 'Seoul / Euljiro',
  camera: 'Sony A7 IV',
  takenAt: '2025-09-14',
  settings: EMPTY_SETTINGS,
  tags: '',
  ...patch,
});

const clip = (patch: Partial<ClipFields> = {}): ClipFields => ({
  title: 'Blue hour',
  description: '',
  rollId: 'roll-a',
  youtubeUrl: '',
  tags: '',
  ...patch,
});

describe('publishProblems', () => {
  it('lets a complete still and clip through', () => {
    expect(publishProblems({ kind: 'still', fields: still() })).toEqual([]);
    expect(publishProblems({ kind: 'clip', fields: clip() })).toEqual([]);
  });

  it('holds a still back for a blank place or camera, whitespace included', () => {
    expect(publishProblems({ kind: 'still', fields: still({ location: '  ', camera: '' }) })).toEqual([
      'a place',
      'a camera',
    ]);
  });

  it('does not hold a still back for a missing date', () => {
    expect(publishProblems({ kind: 'still', fields: still({ takenAt: '' }) })).toEqual([]);
  });

  it('holds a clip back for a title, a roll, and a link that is not YouTube', () => {
    expect(
      publishProblems({ kind: 'clip', fields: clip({ title: '', rollId: '', youtubeUrl: 'https://vimeo.com/1' }) }),
    ).toEqual(['a title', 'a roll', 'a YouTube link that works']);
  });
});

describe('youtubeIdOf', () => {
  it('reads a link with or without its scheme, and treats blank as none', () => {
    expect(youtubeIdOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdOf('youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdOf('  ')).toBe('');
    expect(youtubeIdOf('https://example.com')).toBeNull();
  });
});

describe('needsDate', () => {
  it('is a still with no date, never a clip', () => {
    expect(needsDate({ kind: 'still', fields: still({ takenAt: '' }) })).toBe(true);
    expect(needsDate({ kind: 'still', fields: still() })).toBe(false);
    expect(needsDate({ kind: 'clip', fields: clip() })).toBe(false);
  });
});

describe('tallyQueue', () => {
  it('sorts each item into one bucket and counts undated stills on top', () => {
    const tally = tallyQueue([
      { kind: 'still', stage: 'ready', fields: still() },
      { kind: 'still', stage: 'ready', fields: still({ location: '' }) },
      { kind: 'still', stage: 'uploading', fields: still({ takenAt: '' }) },
      { kind: 'clip', stage: 'encoding', fields: clip() },
      { kind: 'clip', stage: 'failed', fields: clip() },
    ]);
    expect(tally).toEqual({ ready: 1, inProgress: 2, failed: 1, blocked: 1, undated: 1 });
  });
});

describe('itemPercent and queueProgress', () => {
  it('never falls back within a phase when one stage hands over to the next', () => {
    expect(itemPercent('clip', 'reading', 100)).toBeLessThanOrEqual(itemPercent('clip', 'encoding', 0));
    expect(itemPercent('clip', 'encoding', 100)).toBeLessThanOrEqual(itemPercent('clip', 'framing', 0));
    expect(itemPercent('still', 'uploading', 100)).toBeLessThanOrEqual(itemPercent('still', 'saving', 0));
    expect(itemPercent('still', 'queued', 50)).toBe(0);
    expect(itemPercent('still', 'ready', 0)).toBe(100);
  });

  it('averages only what is running, and is null when nothing is', () => {
    expect(queueProgress([{ kind: 'still', stage: 'ready', progress: 100 }])).toBeNull();
    expect(
      queueProgress([
        { kind: 'still', stage: 'ready', progress: 100 },
        { kind: 'still', stage: 'reading', progress: 50 },
        { kind: 'still', stage: 'queued', progress: 0 },
        { kind: 'still', stage: 'failed', progress: 0 },
      ]),
    ).toBe(25);
  });

  it('splits running into local work and sending', () => {
    expect(inFlight('saving')).toBe(true);
    expect(inFlight('ready')).toBe(false);
    expect(inFlight('failed')).toBe(false);
    expect(sending('uploading')).toBe(true);
    expect(sending('encoding')).toBe(false);
  });
});

describe('kindOfFile', () => {
  it('reads the type, then falls back to the extension when the type is empty', () => {
    expect(kindOfFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe('still');
    expect(kindOfFile({ name: 'a.mov', type: 'video/quicktime' })).toBe('clip');
    expect(kindOfFile({ name: 'C0001.MOV', type: '' })).toBe('clip');
    expect(kindOfFile({ name: 'scan.HEIC', type: '' })).toBe('still');
    expect(kindOfFile({ name: 'notes.pdf', type: 'application/pdf' })).toBeNull();
  });
});

describe('applyBulk', () => {
  const bulk = { location: '', camera: '', tags: '', rollId: '' };

  it('applies only what was typed, and adds tags rather than replacing them', () => {
    const next = applyBulk('still', still({ tags: 'street' }), { ...bulk, location: ' Busan ', tags: 'Night, street' });
    expect(next.location).toBe('Busan');
    expect(next.camera).toBe('Sony A7 IV');
    expect(next.tags).toBe('street, night');
  });

  it('gives a clip the roll but never a still’s place or camera', () => {
    const next = applyBulk('clip', clip(), { ...bulk, location: 'Busan', camera: 'X', rollId: 'roll-b' });
    expect(next).toEqual(clip({ rollId: 'roll-b' }));
  });
});

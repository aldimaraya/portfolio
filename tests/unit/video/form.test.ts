import { describe, it, expect } from 'vitest';
import { missingRequiredFields, titleFromFilename, type VideoDraft } from '@/lib/video/form';

const complete: VideoDraft = {
  hasVideo: true,
  hasPreview: true,
  title: 'Boracay Edit',
};

describe('missingRequiredFields', () => {
  it('reports nothing for a complete draft', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });

  it('requires a video and a title', () => {
    expect(missingRequiredFields({ ...complete, hasVideo: false })).toContain('a video');
    expect(missingRequiredFields({ ...complete, title: '' })).toContain('a title');
  });

  it('treats a whitespace-only title as missing', () => {
    expect(missingRequiredFields({ ...complete, title: '   ' })).toContain('a title');
  });

  it('blocks saving until the preview has been generated', () => {
    expect(missingRequiredFields({ ...complete, hasPreview: false })).toContain(
      'a generated preview',
    );
  });

  it('does not ask for a preview when there is no video yet', () => {
    expect(
      missingRequiredFields({ hasVideo: false, hasPreview: false, title: 'Boracay' }),
    ).toEqual(['a video']);
  });

  it('lists every missing field for an empty form', () => {
    expect(
      missingRequiredFields({ hasVideo: false, hasPreview: false, title: '' }),
    ).toEqual(['a video', 'a title']);
  });

  // Description is optional and sort order is assigned server-side.
  it('never requires a description or a sort order', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });
});

describe('titleFromFilename', () => {
  it('drops the extension and splits camelCase', () => {
    expect(titleFromFilename('BoracayEdit.mov')).toBe('Boracay Edit');
  });

  it('turns underscores and hyphens into spaces', () => {
    expect(titleFromFilename('blue_hour-namsan.mp4')).toBe('blue hour namsan');
  });

  it('leaves an already-readable name alone', () => {
    expect(titleFromFilename('Sunset walk.mov')).toBe('Sunset walk');
  });

  it('keeps acronym runs intact', () => {
    expect(titleFromFilename('DSCF1234.MOV')).toBe('DSCF1234');
  });

  it('handles a name with no extension', () => {
    expect(titleFromFilename('untitled')).toBe('untitled');
  });

  it('collapses the runs of separators into single spaces', () => {
    expect(titleFromFilename('a__b--c.mov')).toBe('a b c');
  });
});

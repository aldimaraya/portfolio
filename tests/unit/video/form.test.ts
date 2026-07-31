import { describe, it, expect } from 'vitest';
import { missingRequiredFields, type VideoDraft } from '@/lib/video/form';

const complete: VideoDraft = {
  hasVideo: true,
  hasPreview: true,
  title: 'Blue hour, Namsan',
  rollGroup: 'Seoul',
};

describe('missingRequiredFields', () => {
  it('reports nothing for a complete draft', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });

  it('requires a video, a title and a roll', () => {
    expect(missingRequiredFields({ ...complete, hasVideo: false })).toContain('a video');
    expect(missingRequiredFields({ ...complete, title: '' })).toContain('a title');
    expect(missingRequiredFields({ ...complete, rollGroup: '' })).toContain('a roll');
  });

  it('treats a whitespace-only value as missing', () => {
    expect(missingRequiredFields({ ...complete, title: '   ' })).toContain('a title');
    expect(missingRequiredFields({ ...complete, rollGroup: '\t' })).toContain('a roll');
  });

  it('blocks saving until the preview has been generated', () => {
    expect(missingRequiredFields({ ...complete, hasPreview: false })).toContain(
      'a generated preview',
    );
  });

  it('does not ask for a preview when there is no video yet', () => {
    expect(
      missingRequiredFields({
        hasVideo: false,
        hasPreview: false,
        title: 'Blue hour',
        rollGroup: 'Seoul',
      }),
    ).toEqual(['a video']);
  });

  it('lists every missing field for an empty form', () => {
    expect(
      missingRequiredFields({
        hasVideo: false,
        hasPreview: false,
        title: '',
        rollGroup: '',
      }),
    ).toEqual(['a video', 'a title', 'a roll']);
  });

  // sortOrder defaults to 0 and tags are optional — neither should ever block.
  it('never requires a sort order or tags', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });
});

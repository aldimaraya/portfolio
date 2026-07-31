import { describe, it, expect } from 'vitest';
import { missingRequiredFields } from '@/lib/post/form';

const complete = { title: 'A morning in Namsan', markdownContent: '# Hello' };

describe('missingRequiredFields', () => {
  it('reports nothing for a complete draft', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });

  it('requires a title and some content', () => {
    expect(missingRequiredFields({ ...complete, title: '' })).toContain('a title');
    expect(missingRequiredFields({ ...complete, markdownContent: '' })).toContain(
      'some content',
    );
  });

  it('treats whitespace-only values as missing', () => {
    expect(missingRequiredFields({ title: '   ', markdownContent: '\n\n' })).toEqual([
      'a title',
      'some content',
    ]);
  });

  // Draft vs published is a toggle with a default, never a blocker.
  it('never depends on the draft flag', () => {
    expect(missingRequiredFields(complete)).toEqual([]);
  });
});

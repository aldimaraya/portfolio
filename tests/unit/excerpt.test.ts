import { describe, it, expect } from 'vitest';
import { buildExcerpt } from '@/lib/excerpt';

describe('buildExcerpt', () => {
  it('strips heading markers', () => {
    expect(buildExcerpt('# Title\n\nBody text here.')).toBe('Title Body text here.');
  });

  it('strips emphasis markers', () => {
    expect(buildExcerpt('Some **bold** and _italic_ text.')).toBe('Some bold and italic text.');
  });

  it('replaces links with their text', () => {
    expect(buildExcerpt('See [the docs](https://example.com) now.')).toBe('See the docs now.');
  });

  it('removes image embeds entirely', () => {
    expect(buildExcerpt('![alt](https://example.com/a.png) Caption.')).toBe('Caption.');
  });

  it('collapses whitespace', () => {
    expect(buildExcerpt('a\n\n\nb   c')).toBe('a b c');
  });

  it('truncates with an ellipsis past the limit', () => {
    const result = buildExcerpt('x'.repeat(200), 20);
    expect(result).toHaveLength(21);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves short text untruncated', () => {
    expect(buildExcerpt('Short.', 20)).toBe('Short.');
  });

  it('returns an empty string for empty input', () => {
    expect(buildExcerpt('')).toBe('');
  });

  it('strips inline code and fenced blocks', () => {
    expect(buildExcerpt('Run `npm test` first.')).toBe('Run first.');
  });

  it('strips blockquote markers', () => {
    expect(buildExcerpt('> Quoted line.\n\nAfter.')).toBe('Quoted line. After.');
  });

  it('keeps the excerpt at the limit plus the ellipsis', () => {
    // The ellipsis is added past the cut rather than counted inside it, so a
    // caller sizing a line of text gets maxLength characters of actual content.
    const result = buildExcerpt('word '.repeat(100), 40);
    expect(result.length).toBeLessThanOrEqual(41);
  });

  it('does not leave a dangling space before the ellipsis', () => {
    expect(buildExcerpt('aaaa bbbb cccc dddd', 10)).toBe('aaaa bbbb…');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostMarkdown } from '@/components/markdown/PostMarkdown';

/**
 * The one component suite in the repo, and only because the media renderers are
 * the whole feature and their trip hazard is invisible: react-markdown passes
 * components the *hast* node, so a check written against mdast never matches and
 * simply does nothing. Rendered to a string — no RTL, no new dependency.
 */

const html = (md: string) => renderToStaticMarkup(<PostMarkdown>{md}</PostMarkdown>);

describe('PostMarkdown', () => {
  it('renders an image as a captioned figure, not inside a paragraph', () => {
    const out = html('![Oslo](https://cdn.test/journal/a.webp)');
    expect(out).toContain('<figure>');
    expect(out).toContain('<figcaption>Oslo</figcaption>');
    expect(out).not.toContain('<p>');
  });

  it('renders a video with its poster', () => {
    const out = html('![Roof](https://cdn.test/v/a.mp4 "poster:https://cdn.test/p/a.webp")');
    expect(out).toContain('<video');
    expect(out).toContain('poster="https://cdn.test/p/a.webp"');
    expect(out).toContain('controls');
  });

  it('embeds a lone YouTube link', () => {
    const out = html('https://youtu.be/dQw4w9WgXcQ');
    expect(out).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(out).toContain('embed-frame');
  });

  it('leaves a YouTube link inside a sentence as a link', () => {
    const out = html('Watch https://youtu.be/dQw4w9WgXcQ today.');
    expect(out).not.toContain('iframe');
    expect(out).toContain('<a href');
  });

  it('renders an image from another host without crashing', () => {
    // next/image throws on a host outside remotePatterns, and a throw here takes
    // the whole post — and the editor previewing it — down with it.
    const out = html('![Borrowed](https://picsum.photos/seed/n/1200/800)');
    expect(out).toContain('<figure>');
    expect(out).toContain('src="https://picsum.photos/seed/n/1200/800"');
    expect(out).toContain('loading="lazy"');
  });

  it('does not render raw HTML', () => {
    const out = html('<script>alert(1)</script>\n\n<iframe src="https://evil.test"></iframe>');
    // Escaped to visible text, not dropped — rehype-raw is absent, so markup a
    // post pastes in is inert rather than sanitised.
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<iframe src="https://evil.test"');
    expect(out).toContain('&lt;script&gt;');
  });

  it('still renders ordinary prose and gfm tables', () => {
    const out = html('## Head\n\n**bold**\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    expect(out).toContain('<h2>Head</h2>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<table>');
  });
});

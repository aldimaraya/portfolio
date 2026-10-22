import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostBody } from '@/components/journal/PostBody';
import { RichText } from '@/components/journal/RichText';
import { richTextSchema, type Block } from '@/lib/post/content';
import { emptyMedia, type PostMedia } from '@/lib/post/media';

/**
 * The renderer is where the "no markup from a post" guarantee is kept, so its
 * edges are tested as rendered HTML — rendered to a string, no RTL.
 */

const html = (blocks: Block[], media: PostMedia = emptyMedia()) => renderToStaticMarkup(<PostBody blocks={blocks} media={media} />);

describe('RichText', () => {
  it('renders text as text, never as markup', () => {
    const doc = richTextSchema.parse({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] }] });
    const out = renderToStaticMarkup(<RichText doc={doc} />);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders marks and links, and skips empty paragraphs', () => {
    const doc = richTextSchema.parse({
      type: 'doc',
      content: [
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'here', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://x.test' } }] }],
        },
      ],
    });
    const out = renderToStaticMarkup(<RichText doc={doc} />);
    expect(out).toBe('<p><span><a href="https://x.test" rel="noreferrer"><strong>here</strong></a></span></p>');
  });
});

describe('PostBody', () => {
  it('puts a section label and date in the margin, and anchors the row', () => {
    const out = html([{ id: 's1', type: 'section', numbered: true, label: '', title: 'Arrival', date: 'Thu 14 Mar', place: 'Seoul' }]);
    expect(out).toContain('id="section-s1"');
    expect(out).toContain('post-row--section');
    expect(out).toContain('<span class="post-margin-label">Day 1</span>');
    expect(out).toContain('Thu 14 Mar');
    expect(out).toContain('<h2 class="post-section-title">Arrival</h2>');
  });

  it('marks wide and full photo rows', () => {
    const media: PostMedia = { ...emptyMedia(), journal: { p: { url: 'https://elsewhere.test/a.jpg', width: 1500, height: 1000, alt: '' } } };
    const block = (size: 'wide' | 'full'): Block => ({
      id: size,
      type: 'photos',
      items: [{ kind: 'journal', id: 'p' }],
      layout: 'stacked',
      size,
      caption: 'Market',
    });
    expect(html([block('wide')], media)).toContain('post-row--wide');
    expect(html([block('full')], media)).toContain('post-row--full');
    expect(html([block('full')], media)).toContain('<figcaption>Market</figcaption>');
  });

  it('draws nothing for photos whose rows are gone', () => {
    const out = html([{ id: 'p', type: 'photos', items: [{ kind: 'journal', id: 'deleted' }], layout: 'row', size: 'column', caption: 'x' }]);
    expect(out).not.toContain('<figure');
  });

  it('embeds YouTube through the privacy domain, and ignores a link that is not a video', () => {
    expect(html([{ id: 'e', type: 'embed', url: 'https://youtu.be/dQw4w9WgXcQ', caption: '' }])).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(html([{ id: 'e', type: 'embed', url: 'https://example.com/page', caption: '' }])).not.toContain('<video');
  });

  it('lists only the packing items that have something in them', () => {
    const out = html([{ id: 'l', type: 'list', groups: [{ name: 'Bag', items: [{ name: 'Daypack', note: '20 L' }, { name: '', note: '' }] }] }]);
    expect(out.match(/<li>/g)).toHaveLength(1);
    expect(out).toContain('<h4>Bag</h4>');
  });
});

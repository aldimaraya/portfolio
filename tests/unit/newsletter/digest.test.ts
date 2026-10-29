import { describe, it, expect } from 'vitest';
import {
  contentFor,
  digestSubject,
  emailImageUrl,
  escapeHtml,
  isEmpty,
  MAX_PHOTO_THUMBNAILS,
  photoRows,
  ROW_MAX_HEIGHT,
  ROW_TARGET_HEIGHT,
  photoEmailCaption,
  renderConfirmation,
  renderDigest,
  type DigestContent,
} from '@/lib/newsletter/digest';
import { DEFAULT_PREFERENCES } from '@/lib/newsletter/kinds';
import { NEWSLETTER_NAME } from '@/lib/site';

const site = 'https://idlabs.me';
const manage = `${site}/newsletter/manage?token=abc`;

const post = { id: 'p1', title: 'On grain', slug: 'on-grain', excerpt: 'Why film.' };
const clip = { id: 'v1', title: 'Harbour', description: '', posterImageUrl: 'https://media.example.com/poster.jpg' };
const photo = (id: string) => ({
  id,
  imageUrl: `https://media.example.com/${id}.jpg`,
  title: '',
  location: 'Lisbon',
  width: 1500,
  height: 1000,
  takenAt: null as Date | null,
});
const sized = (id: string, width: number, height: number) => ({ ...photo(id), width, height });

const empty: DigestContent = { journal: [], motion: [], stills: [] };

describe('digestSubject', () => {
  it('names a single post', () => {
    expect(digestSubject({ ...empty, journal: [post] })).toBe('New in the journal: On grain');
  });

  it('names a single clip', () => {
    expect(digestSubject({ ...empty, motion: [clip] })).toBe('New clip: Harbour');
  });

  it('counts photos, singular and plural', () => {
    expect(digestSubject({ ...empty, stills: [photo('a')] })).toBe('1 new photo on the wall');
    expect(digestSubject({ ...empty, stills: [photo('a'), photo('b')] })).toBe('2 new photos on the wall');
  });

  it('counts each kind in a mixed batch', () => {
    expect(digestSubject({ journal: [post], motion: [clip, clip], stills: [photo('a')] })).toBe(
      `New on ${NEWSLETTER_NAME}: 1 journal post, 2 clips and 1 photo`,
    );
  });
});

describe('contentFor', () => {
  it('drops the kinds a subscriber did not choose', () => {
    const all = { journal: [post], motion: [clip], stills: [photo('a')] };
    const narrowed = contentFor(all, { journal: false, motion: true, stills: false });
    expect(narrowed).toEqual({ journal: [], motion: [clip], stills: [] });
  });

  it('leaves nothing to send when nothing chosen was published', () => {
    const narrowed = contentFor({ ...empty, stills: [photo('a')] }, { journal: true, motion: true, stills: false });
    expect(isEmpty(narrowed)).toBe(true);
  });
});

describe('renderDigest', () => {
  it('escapes titles typed into the admin', () => {
    const { html } = renderDigest(
      { ...empty, journal: [{ ...post, title: '<script>x</script>' }] },
      DEFAULT_PREFERENCES,
      { site, manage },
    );
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('carries the manage link in both parts', () => {
    const rendered = renderDigest({ ...empty, journal: [post] }, DEFAULT_PREFERENCES, { site, manage });
    expect(rendered.text).toContain(manage);
    expect(rendered.html).toContain(escapeHtml(manage));
  });

  it('links posts and clips to their own pages', () => {
    const { text } = renderDigest({ ...empty, journal: [post], motion: [clip] }, DEFAULT_PREFERENCES, { site, manage });
    expect(text).toContain(`${site}/journal/on-grain`);
    expect(text).toContain(`${site}/motion/v1`);
  });

  it('shows a limited number of thumbnails and counts the rest', () => {
    const photos = Array.from({ length: MAX_PHOTO_THUMBNAILS + 3 }, (_, i) => photo(`p${i}`));
    const { html } = renderDigest({ ...empty, stills: photos }, DEFAULT_PREFERENCES, { site, manage });
    expect(html.match(/<img /g)).toHaveLength(MAX_PHOTO_THUMBNAILS);
    expect(html).toContain(`See all ${photos.length} on the wall`);
  });

  it('serves images through the optimiser, never full size', () => {
    const { html } = renderDigest({ ...empty, stills: [photo('a')] }, DEFAULT_PREFERENCES, { site, manage });
    expect(html).toContain(escapeHtml(emailImageUrl(site, 'https://media.example.com/a.jpg')));
    expect(html).not.toContain('src="https://media.example.com/');
  });

  it('names only the chosen kinds in the footer', () => {
    const { html } = renderDigest({ ...empty, journal: [post] }, { journal: true, motion: false, stills: true }, { site, manage });
    expect(html).toContain('Journal and Stills updates');
  });
});

describe('emailImageUrl', () => {
  it('asks for a width and quality next/image allows by default', () => {
    expect(emailImageUrl(site, 'https://m.example.com/a b.jpg')).toBe(
      `${site}/_next/image?url=https%3A%2F%2Fm.example.com%2Fa%20b.jpg&w=640&q=75`,
    );
  });
});

describe('renderConfirmation', () => {
  it('names the site, not only the person', () => {
    expect(renderConfirmation(`${site}/x`, site).subject).toBe(`Confirm your subscription to ${NEWSLETTER_NAME}`);
  });

  it('links the full origin it was given, subdomain included', () => {
    const origin = 'https://portfolio.idlabs.me';
    const email = renderConfirmation(`${origin}/newsletter/confirm?token=abc`, origin);
    expect(email.html).toContain(`href="${origin}"`);
    expect(email.html).toContain('>portfolio.idlabs.me</a>');
  });

  it('carries the confirm link', () => {
    const url = `${site}/newsletter/confirm?token=abc`;
    const email = renderConfirmation(url, site);
    expect(email.text).toContain(url);
    expect(email.html).toContain(escapeHtml(url));
  });
});

describe('separate image origin', () => {
  it('links to one origin and loads images from another', () => {
    const local = 'http://localhost:3000';
    const { html } = renderDigest({ ...empty, stills: [photo('a')] }, DEFAULT_PREFERENCES, {
      site: local,
      images: site,
      manage: `${local}/newsletter`,
    });
    expect(html).toContain(escapeHtml(`${local}/stills?photo=a`));
    expect(html).toContain(escapeHtml(emailImageUrl(site, 'https://media.example.com/a.jpg')));
    expect(html).not.toContain(`${local}/_next/image`);
  });
});

describe('photo captions', () => {
  const taken = new Date('2026-08-14T00:00:00Z');

  it('leads with the title and drops the location beneath it', () => {
    const caption = photoEmailCaption({ ...photo('a'), title: 'Ferry', takenAt: taken });
    expect(caption.heading).toBe('Ferry');
    expect(caption.meta).toMatch(/^Lisbon · /);
  });

  it('leads with the location when there is no title', () => {
    const caption = photoEmailCaption({ ...photo('a'), takenAt: taken });
    expect(caption.heading).toBe('Lisbon');
    expect(caption.meta).not.toContain('Lisbon');
    expect(caption.meta).not.toBe('');
  });

  it('leaves an unknown date out rather than printing a blank', () => {
    expect(photoEmailCaption(photo('a')).meta).toBe('');
    expect(photoEmailCaption({ ...photo('a'), title: 'Ferry' }).meta).toBe('Lisbon');
  });

  it('puts the caption in both parts of the email', () => {
    const { html, text } = renderDigest(
      { ...empty, stills: [{ ...photo('a'), title: 'Ferry <3' }] },
      DEFAULT_PREFERENCES,
      { site, manage },
    );
    expect(html).toContain('Ferry &lt;3');
    expect(text).toContain('Ferry <3 — Lisbon');
  });
});

describe('photoRows', () => {
  const heights = (row: { height: number }[]) => new Set(row.map((tile) => tile.height));
  const span = (row: { percent: number }[]) => row.reduce((sum, tile) => sum + tile.percent, 0);

  it('gives every photo in a row the same height, whatever its shape', () => {
    const rows = photoRows([sized('land', 1500, 1000), sized('tall', 1000, 1500)]);
    expect(rows).toHaveLength(1);
    expect(heights(rows[0]).size).toBe(1);
    // Widths follow shape: the landscape frame is wider than the portrait.
    expect(rows[0][0].width).toBeGreaterThan(rows[0][1].width);
  });

  it('fills the width with a short last row when that stays a sensible height', () => {
    const [row] = photoRows([sized('land', 1500, 1000), sized('tall', 1000, 1500)]);
    expect(span(row)).toBeGreaterThan(99);
    expect(span(row)).toBeLessThanOrEqual(100);
  });

  it('leaves a lone portrait short rather than stretching it to full width', () => {
    const [row] = photoRows([sized('tall', 1000, 1500)]);
    // As tall as the cap allows, not the wall's shorter row height.
    expect(row[0].height).toBe(ROW_MAX_HEIGHT);
    expect(span(row)).toBeLessThan(60);
  });

  it('breaks a larger batch into several full rows', () => {
    const rows = photoRows(Array.from({ length: 6 }, (_, i) => sized(`p${i}`, 1500, 1000)));
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows.slice(0, -1)) {
      expect(span(row)).toBeGreaterThan(99);
      expect([...heights(row)][0]).toBeLessThanOrEqual(ROW_TARGET_HEIGHT);
    }
  });

  it('puts gutters only between photos, never at the row edges', () => {
    const [row] = photoRows([sized('a', 1500, 1000), sized('b', 1000, 1500)]);
    expect(row[0].padLeft).toBe(0);
    expect(row[row.length - 1].padRight).toBe(0);
    expect(row[0].padRight + row[1].padLeft).toBeGreaterThan(0);
  });

  it('pads a short last row with an empty cell instead of stretching it', () => {
    const { html } = renderDigest({ ...empty, stills: [sized('tall', 1000, 1500)] }, DEFAULT_PREFERENCES, { site, manage });
    expect(html).toMatch(/<td width="[\d.]+%"><\/td>/);
  });

  it('treats a photo with no stored size as square instead of breaking the row', () => {
    const [row] = photoRows([sized('unknown', 0, 0), sized('land', 1500, 1000)]);
    expect(heights(row).size).toBe(1);
  });
});

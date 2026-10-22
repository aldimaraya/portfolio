import { describe, expect, it } from 'vitest';
import {
  hasBody,
  isSafeHref,
  parseContent,
  plainText,
  richTextFromPlain,
  richTextSchema,
} from '@/lib/post/content';

const doc = (content: unknown[]) => ({ type: 'doc', content });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown[]) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });

describe('isSafeHref', () => {
  it('allows the web, email and the site itself', () => {
    for (const href of ['https://example.com', 'http://example.com/a', 'mailto:a@b.c', '/stills', '#day-2']) {
      expect(isSafeHref(href)).toBe(true);
    }
  });

  it('refuses scripts, data and protocol-relative links', () => {
    for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', '//evil.test', 'vbscript:x']) {
      expect(isSafeHref(href)).toBe(false);
    }
  });
});

describe('richTextSchema', () => {
  it('accepts what TipTap emits for the enabled nodes and marks', () => {
    const value = doc([
      para(text('Bold', [{ type: 'bold' }]), { type: 'hardBreak' }, text('link', [{ type: 'link', attrs: { href: 'https://x.test', target: '_blank', rel: null, class: null } }])),
      { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('one'))] }] },
      { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [para(text('three'))] }] },
      { type: 'paragraph' },
    ]);
    const parsed = richTextSchema.safeParse(value);
    expect(parsed.success).toBe(true);
    // Only `start` survives on a list's attrs.
    expect(parsed.success && parsed.data.content[2]).toMatchObject({ attrs: { start: 3 } });
  });

  it('rejects a node the editor does not have', () => {
    expect(richTextSchema.safeParse(doc([{ type: 'heading', attrs: { level: 1 }, content: [text('x')] }])).success).toBe(false);
    expect(richTextSchema.safeParse(doc([{ type: 'codeBlock', content: [text('x')] }])).success).toBe(false);
  });

  it('rejects an unsafe link rather than storing it', () => {
    const value = doc([para(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))]);
    expect(richTextSchema.safeParse(value).success).toBe(false);
  });

  it('rejects an unknown mark', () => {
    expect(richTextSchema.safeParse(doc([para(text('x', [{ type: 'strike' }]))])).success).toBe(false);
  });
});

describe('plainText', () => {
  it('joins paragraphs and nested list items with spaces', () => {
    const value = richTextSchema.parse(
      doc([
        para(text('Landed at '), text('six', [{ type: 'bold' }]), text('.')),
        { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('Market'))] }] },
      ]),
    );
    expect(plainText(value)).toBe('Landed at six. Market');
  });
});

describe('richTextFromPlain', () => {
  it('splits on blank lines and keeps an empty doc editable', () => {
    expect(richTextFromPlain('a\n\nb').content).toHaveLength(2);
    expect(richTextFromPlain('   ')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('parseContent', () => {
  it('returns null for no content, so the caller falls back to Markdown', () => {
    expect(parseContent(null)).toBeNull();
    expect(parseContent(undefined)).toBeNull();
  });

  it('returns null rather than throwing on content that does not validate', () => {
    expect(parseContent({ version: 2, blocks: [] })).toBeNull();
    expect(parseContent({ version: 1, blocks: [{ id: 'a', type: 'html', html: '<script>' }] })).toBeNull();
  });

  it('fills defaults for optional strings', () => {
    const parsed = parseContent({ version: 1, blocks: [{ id: 'a', type: 'section', numbered: true }] });
    expect(parsed?.blocks[0]).toEqual({ id: 'a', type: 'section', numbered: true, label: '', title: '', date: '', place: '' });
  });

  it('refuses a photo layout that does not exist', () => {
    expect(
      parseContent({ version: 1, blocks: [{ id: 'a', type: 'photos', items: [], layout: 'masonry', size: 'column' }] }),
    ).toBeNull();
  });
});

describe('hasBody', () => {
  it('counts a tip with only a heading', () => {
    expect(hasBody({ version: 1, blocks: [{ id: 'a', type: 'tip', title: 'Hack', body: richTextFromPlain('') }] })).toBe(true);
  });

  it('does not count dividers or a list of empty items', () => {
    expect(
      hasBody({
        version: 1,
        blocks: [
          { id: 'a', type: 'divider' },
          { id: 'b', type: 'list', groups: [{ name: 'Bag', items: [{ name: ' ', note: 'x' }] }] },
        ],
      }),
    ).toBe(false);
  });
});

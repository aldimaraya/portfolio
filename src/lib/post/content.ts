import { z } from 'zod';
import { MAX_SCALE, MIN_SCALE } from './fit';

/**
 * A journal post's body: an ordered list of blocks, stored as JSON on
 * BlogPost.content and validated here on every save and every read.
 *
 * This is the whole vocabulary a post can use. There is no HTML block and no
 * Markdown: the renderer builds every element itself from these fields, so a
 * post can never smuggle markup onto the page — the guarantee the Markdown
 * renderer used to get from leaving rehype-raw out.
 *
 * Rich text is the subset of ProseMirror's JSON that TipTap's StarterKit emits
 * for the marks and nodes the editor enables, so the editor's getJSON() is
 * storable as-is once it has been through parseRichText. Anything outside the
 * subset is rejected rather than passed through.
 */

// ── Rich text ────────────────────────────────────────────────────────────────

const ALLOWED_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

/**
 * Whether a link target is one a post may carry. Relative and fragment links
 * stay on the site; anything with a scheme must be http(s) or mailto, so a
 * pasted `javascript:` link is refused here rather than escaped later.
 */
export function isSafeHref(href: string): boolean {
  return ALLOWED_HREF.test(href.trim());
}

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({
    type: z.literal('link'),
    attrs: z.object({ href: z.string().refine(isSafeHref, 'Unsafe link') }).loose(),
  }),
]);

export type Mark = z.infer<typeof markSchema>;

const textSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(markSchema).optional(),
});

const hardBreakSchema = z.object({ type: z.literal('hardBreak') });

const inlineSchema = z.discriminatedUnion('type', [textSchema, hardBreakSchema]);

export type InlineNode = z.infer<typeof inlineSchema>;

const paragraphSchema = z.object({
  type: z.literal('paragraph'),
  content: z.array(inlineSchema).optional(),
});

export type ParagraphNode = z.infer<typeof paragraphSchema>;

export interface ListItemNode {
  type: 'listItem';
  content: (ParagraphNode | ListNode)[];
}

export interface ListNode {
  type: 'bulletList' | 'orderedList';
  attrs?: { start?: number };
  content: ListItemNode[];
}

export type RichBlockNode = ParagraphNode | ListNode;

export interface RichText {
  type: 'doc';
  content: RichBlockNode[];
}

// Recursive, so typed by hand above and asserted onto the schema: Zod cannot
// infer through z.lazy without help.
const listSchema: z.ZodType<ListNode> = z.lazy(() =>
  z.object({
    type: z.enum(['bulletList', 'orderedList']),
    // TipTap also writes `type: null` on ordered lists; only `start` matters.
    attrs: z
      .object({ start: z.number().int().optional() })
      .loose()
      .optional()
      .transform((attrs) => (attrs?.start !== undefined ? { start: attrs.start } : undefined)),
    content: z.array(listItemSchema).min(1),
  }),
) as unknown as z.ZodType<ListNode>;

const listItemSchema: z.ZodType<ListItemNode> = z.lazy(() =>
  z.object({
    type: z.literal('listItem'),
    content: z.array(z.union([paragraphSchema, listSchema])).min(1),
  }),
) as unknown as z.ZodType<ListItemNode>;

export const richTextSchema: z.ZodType<RichText> = z.object({
  type: z.literal('doc'),
  content: z.array(z.union([paragraphSchema, listSchema])),
}) as unknown as z.ZodType<RichText>;

export function emptyRichText(): RichText {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Rich text from plain paragraphs, one per non-empty line group. */
export function richTextFromPlain(text: string): RichText {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map<ParagraphNode>((chunk) => ({ type: 'paragraph', content: [{ type: 'text', text: chunk }] }));
  return { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] };
}

/** Every character of a rich text, paragraphs and list items separated by spaces. */
export function plainText(doc: RichText): string {
  const parts: string[] = [];
  const walk = (node: RichBlockNode | ListItemNode) => {
    if (node.type === 'paragraph') {
      parts.push(
        (node.content ?? []).map((inline) => (inline.type === 'text' ? inline.text : ' ')).join(''),
      );
      return;
    }
    node.content.forEach(walk);
  };
  doc.content.forEach(walk);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function isRichTextEmpty(doc: RichText): boolean {
  return plainText(doc) === '';
}

// ── Blocks ───────────────────────────────────────────────────────────────────

/**
 * A photo in a photos block. `journal` is a JournalPhoto uploaded into this
 * post; `still` is a Photo off the wall, reused; `external` exists only for
 * Markdown posts whose images were never in our tables — the converter's way of
 * not dropping them.
 */
export const photoRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('journal'), id: z.string().min(1) }),
  z.object({ kind: z.literal('still'), id: z.string().min(1) }),
  z.object({ kind: z.literal('external'), url: z.string().min(1), alt: z.string().default('') }),
]);

export type PhotoRef = z.infer<typeof photoRefSchema>;

export const PHOTO_LAYOUTS = ['stacked', 'row', 'grid', 'carousel'] as const;
export const PHOTO_SIZES = ['column', 'wide', 'full'] as const;

export type PhotoLayout = (typeof PHOTO_LAYOUTS)[number];
export type PhotoSize = (typeof PHOTO_SIZES)[number];

const id = z.string().min(1);
const line = z.string().default('');

const sectionBlock = z.object({
  id,
  type: z.literal('section'),
  // A numbered section is a day: labelled "Day N" by its position among the
  // other numbered sections unless `label` overrides it. A plain section is not
  // counted and is labelled only by `label`.
  numbered: z.boolean(),
  label: line,
  title: line,
  date: line,
  place: line,
  // The calendar day (YYYY-MM-DD) of the tray photos this section was laid out
  // from, so "lay out days not in the post yet" knows which are done. Not shown.
  tripDate: z.string().optional(),
});

const textBlock = z.object({
  id,
  type: z.literal('text'),
  body: richTextSchema,
  // A category name shown in the margin beside text the tray laid out, e.g. "Food".
  tag: z.string().optional(),
});

const headingBlock = z.object({ id, type: z.literal('heading'), text: line });

const photosBlock = z.object({
  id,
  type: z.literal('photos'),
  items: z.array(photoRefSchema),
  layout: z.enum(PHOTO_LAYOUTS),
  size: z.enum(PHOTO_SIZES),
  // A share of the width `size` gives the block, in percent, set by dragging its
  // edge in the editor. Absent is 100. Optional rather than defaulted so every
  // post saved before it existed parses, and so code from before it — which
  // strips the key — still renders posts saved after. See lib/post/fit.ts.
  scale: z.number().int().min(MIN_SCALE).max(MAX_SCALE).optional(),
  caption: line,
});

const tipBlock = z.object({ id, type: z.literal('tip'), title: line, body: richTextSchema });

const listBlock = z.object({
  id,
  type: z.literal('list'),
  groups: z.array(
    z.object({
      name: line,
      items: z.array(z.object({ name: line, note: line })),
    }),
  ),
});

const clipBlock = z.object({ id, type: z.literal('clip'), videoId: z.string(), caption: line });

/** A YouTube link, or a video file the converter found that matches no clip. */
const embedBlock = z.object({
  id,
  type: z.literal('embed'),
  url: line,
  poster: z.string().optional(),
  caption: line,
});

const quoteBlock = z.object({ id, type: z.literal('quote'), text: line });

const dividerBlock = z.object({ id, type: z.literal('divider') });

export const blockSchema = z.discriminatedUnion('type', [
  sectionBlock,
  textBlock,
  headingBlock,
  photosBlock,
  tipBlock,
  listBlock,
  clipBlock,
  embedBlock,
  quoteBlock,
  dividerBlock,
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const postContentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(blockSchema),
});

export type PostContent = z.infer<typeof postContentSchema>;

/**
 * The stored body, or null when there is none or it does not validate. Null
 * sends the caller to the Markdown fallback rather than throwing: a row that
 * somehow fails the schema should render as its legacy body, not take the page
 * down.
 */
export function parseContent(value: unknown): PostContent | null {
  if (value === null || value === undefined) return null;
  const parsed = postContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function emptyContent(): PostContent {
  return { version: 1, blocks: [] };
}

/** A short random id for a new block. Unique within a post is all it needs. */
export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Whether a post has anything a reader would see. */
export function hasBody(content: PostContent): boolean {
  return content.blocks.some((block) => {
    switch (block.type) {
      case 'text':
      case 'tip':
        return !isRichTextEmpty(block.body) || (block.type === 'tip' && block.title.trim() !== '');
      case 'section':
        return block.title.trim() !== '';
      case 'heading':
      case 'quote':
        return block.text.trim() !== '';
      case 'photos':
        return block.items.length > 0;
      case 'list':
        return block.groups.some((group) => group.items.some((item) => item.name.trim() !== ''));
      case 'clip':
        return block.videoId !== '';
      case 'embed':
        return block.url.trim() !== '';
      case 'divider':
        return false;
    }
  });
}

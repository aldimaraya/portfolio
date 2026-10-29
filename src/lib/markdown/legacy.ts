import type {
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import {
  isSafeHref,
  newBlockId,
  type Block,
  type InlineNode,
  type ListItemNode,
  type ListNode,
  type Mark,
  type ParagraphNode,
  type PostContent,
  type RichBlockNode,
} from '@/lib/post/content';
import { isVideoUrl, posterFromTitle, youtubeId } from './media';

/**
 * Converts a post written before the block editor into blocks.
 *
 * Runs on read, not as a migration: a post whose `content` is still null is
 * converted each time it is rendered or opened for editing, and the first save
 * from the editor stores the result. Nothing is rewritten behind the writer's
 * back, and the Markdown column is left exactly as it was.
 *
 * The mapping follows what the Markdown renderer used to make of each shape
 * (see lib/markdown/media.ts): an image alone in a paragraph was a captioned
 * figure, an image whose target is a video file was a player, and a YouTube
 * link alone in a paragraph was an embed. Prose and lists become rich text;
 * headings become headings rather than sections, because sections did not exist
 * and inventing days for an old post would put words in its mouth. Raw HTML was
 * never rendered, so it is dropped here too.
 */
export function markdownToContent(markdown: string): PostContent {
  const tree: Root = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  const blocks: Block[] = [];
  let prose: RichBlockNode[] = [];

  // Consecutive paragraphs and lists share one text block, the way they shared
  // one stretch of prose.
  const flush = () => {
    if (prose.length) blocks.push({ id: newBlockId(), type: 'text', body: { type: 'doc', content: prose } });
    prose = [];
  };
  const push = (block: Block) => {
    flush();
    blocks.push(block);
  };

  for (const node of tree.children) {
    convertTopLevel(node, prose, push);
  }
  flush();

  return { version: 1, blocks };
}

function convertTopLevel(node: RootContent, prose: RichBlockNode[], push: (block: Block) => void): void {
  switch (node.type) {
    case 'paragraph': {
      const media = paragraphMedia(node);
      if (media) {
        media.forEach(push);
        return;
      }
      const { paragraph, images } = convertParagraph(node);
      if (paragraph.content?.length) prose.push(paragraph);
      // An image mid-sentence used to render as a figure inside the paragraph;
      // here it follows the paragraph as its own block instead.
      images.forEach(push);
      return;
    }
    case 'list':
      prose.push(convertList(node));
      return;
    case 'heading':
      push({ id: newBlockId(), type: 'heading', text: textContent(node.children) });
      return;
    case 'blockquote':
      push({ id: newBlockId(), type: 'quote', text: node.children.map(blockText).join('\n\n') });
      return;
    case 'thematicBreak':
      push({ id: newBlockId(), type: 'divider' });
      return;
    case 'code':
      if (node.value.trim()) prose.push(plainParagraph(node.value));
      return;
    case 'table':
      for (const row of node.children) {
        const text = row.children.map((cell) => textContent(cell.children)).filter(Boolean).join(' · ');
        if (text) prose.push(plainParagraph(text));
      }
      return;
    default:
      // html, definitions, footnotes, yaml: nothing the old renderer showed.
      return;
  }
}

/** Children that are not whitespace-only text. */
function meaningful(children: PhrasingContent[]): PhrasingContent[] {
  return children.filter((child) => !(child.type === 'text' && !child.value.trim()) && child.type !== 'break');
}

/**
 * The blocks for a paragraph that is nothing but media — one or more images, or
 * a lone YouTube link — or null for a paragraph of prose.
 */
function paragraphMedia(node: Paragraph): Block[] | null {
  const children = meaningful(node.children);
  if (!children.length) return null;

  if (children.every((child) => child.type === 'image')) {
    return children.map((child) => imageBlock(child as Extract<PhrasingContent, { type: 'image' }>));
  }

  if (children.length === 1 && children[0].type === 'link') {
    const href = children[0].url;
    if (youtubeId(href)) return [{ id: newBlockId(), type: 'embed', url: href, caption: '' }];
  }

  return null;
}

function imageBlock(image: Extract<PhrasingContent, { type: 'image' }>): Block {
  const caption = (image.alt ?? '').trim();
  if (isVideoUrl(image.url)) {
    const poster = posterFromTitle(image.title);
    return { id: newBlockId(), type: 'embed', url: image.url, caption, ...(poster ? { poster } : {}) };
  }
  return {
    id: newBlockId(),
    type: 'photos',
    items: [{ kind: 'external', url: image.url, alt: caption }],
    layout: 'stacked',
    size: 'column',
    caption,
  };
}

function convertParagraph(node: Paragraph): { paragraph: ParagraphNode; images: Block[] } {
  const images: Block[] = [];
  const content = inlines(node.children, [], images);
  return { paragraph: content.length ? { type: 'paragraph', content } : { type: 'paragraph' }, images };
}

function inlines(children: PhrasingContent[], marks: Mark[], images: Block[]): InlineNode[] {
  const out: InlineNode[] = [];

  const text = (value: string) => {
    if (!value) return;
    out.push(marks.length ? { type: 'text', text: value, marks: [...marks] } : { type: 'text', text: value });
  };

  for (const child of children) {
    switch (child.type) {
      case 'text':
        text(child.value);
        break;
      case 'inlineCode':
        text(child.value);
        break;
      case 'break':
        out.push({ type: 'hardBreak' });
        break;
      case 'strong':
        out.push(...inlines(child.children, withMark(marks, { type: 'bold' }), images));
        break;
      case 'emphasis':
        out.push(...inlines(child.children, withMark(marks, { type: 'italic' }), images));
        break;
      case 'delete':
        // No strikethrough in the editor; the words survive, the line does not.
        out.push(...inlines(child.children, marks, images));
        break;
      case 'link': {
        const safe = isSafeHref(child.url);
        const linked = safe ? withMark(marks, { type: 'link', attrs: { href: child.url } }) : marks;
        out.push(...inlines(child.children, linked, images));
        break;
      }
      case 'linkReference':
        out.push(...inlines(child.children, marks, images));
        break;
      case 'image':
        images.push(imageBlock(child));
        break;
      default:
        // html, imageReference, footnoteReference: never rendered before either.
        break;
    }
  }

  return out;
}

function withMark(marks: Mark[], mark: Mark): Mark[] {
  return marks.some((have) => have.type === mark.type) ? marks : [...marks, mark];
}

function convertList(node: List): ListNode {
  const start = node.ordered && typeof node.start === 'number' && node.start !== 1 ? node.start : undefined;
  return {
    type: node.ordered ? 'orderedList' : 'bulletList',
    ...(start !== undefined ? { attrs: { start } } : {}),
    content: node.children.map(convertListItem),
  };
}

function convertListItem(item: ListItem): ListItemNode {
  const content: (ParagraphNode | ListNode)[] = [];
  for (const child of item.children) {
    if (child.type === 'paragraph') content.push(convertParagraph(child).paragraph);
    else if (child.type === 'list') content.push(convertList(child));
    else {
      const text = blockText(child);
      if (text) content.push(plainParagraph(text));
    }
  }
  // A list item must hold something to be valid rich text.
  return { type: 'listItem', content: content.length ? content : [{ type: 'paragraph' }] };
}

function plainParagraph(value: string): ParagraphNode {
  return { type: 'paragraph', content: [{ type: 'text', text: value }] };
}

function textContent(children: PhrasingContent[]): string {
  return children
    .map((child) => {
      if ('value' in child && typeof child.value === 'string' && child.type !== 'html') return child.value;
      if ('children' in child) return textContent(child.children as PhrasingContent[]);
      return child.type === 'image' ? '' : child.type === 'break' ? ' ' : '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function blockText(node: RootContent): string {
  if (node.type === 'paragraph' || node.type === 'heading') return textContent(node.children);
  if (node.type === 'code') return node.value;
  if ('children' in node) return (node.children as RootContent[]).map(blockText).filter(Boolean).join(' ');
  return '';
}

// ── Resolving against the library ────────────────────────────────────────────

export interface LegacyUrls {
  images: string[];
  videos: string[];
}

/** The media URLs a converted post names, to look up in the photo and video tables. */
export function legacyMediaUrls(content: PostContent): LegacyUrls {
  const images = new Set<string>();
  const videos = new Set<string>();
  for (const block of content.blocks) {
    if (block.type === 'photos') {
      for (const ref of block.items) if (ref.kind === 'external') images.add(ref.url);
    } else if (block.type === 'embed' && !youtubeId(block.url)) {
      videos.add(block.url);
    }
  }
  return { images: [...images], videos: [...videos] };
}

/**
 * Swaps a converted post's URLs for references wherever the URL is a photo or
 * clip in the library — which every image the old media picker inserted from
 * the wall or the reel is. Those then render with their real dimensions, and
 * from the next save they are tied to the row rather than to its URL.
 */
export function resolveLegacyMedia(
  content: PostContent,
  stillsByUrl: Map<string, string>,
  clipsByUrl: Map<string, string>,
): PostContent {
  return {
    ...content,
    blocks: content.blocks.map((block): Block => {
      if (block.type === 'photos') {
        return {
          ...block,
          items: block.items.map((ref) => {
            const id = ref.kind === 'external' ? stillsByUrl.get(ref.url) : undefined;
            return id ? { kind: 'still' as const, id } : ref;
          }),
        };
      }
      if (block.type === 'embed') {
        const videoId = clipsByUrl.get(block.url);
        if (videoId) return { id: block.id, type: 'clip', videoId, caption: block.caption };
      }
      return block;
    }),
  };
}

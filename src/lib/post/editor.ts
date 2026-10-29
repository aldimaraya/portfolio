import { emptyRichText, newBlockId, type Block, type BlockOf, type PhotoRef } from './content';
import { autoLayout } from './trip';

/**
 * The edits the block editor makes, as pure functions over the block list. The
 * component holds state and wires events; everything that decides what the
 * post becomes lives here, where it can be tested without a DOM.
 */

/** What the insert menu offers, in menu order. `day` and `section` are both section blocks. */
export const INSERTABLE = [
  'day',
  'section',
  'text',
  'heading',
  'photos',
  'tip',
  'list',
  'clip',
  'embed',
  'quote',
  'divider',
] as const;

export type Insertable = (typeof INSERTABLE)[number];

export function makeBlock(kind: Insertable): Block {
  const id = newBlockId();
  switch (kind) {
    case 'day':
      return { id, type: 'section', numbered: true, label: '', title: '', date: '', place: '' };
    case 'section':
      return { id, type: 'section', numbered: false, label: '', title: '', date: '', place: '' };
    case 'text':
      return { id, type: 'text', body: emptyRichText() };
    case 'heading':
      return { id, type: 'heading', text: '' };
    case 'photos':
      return { id, type: 'photos', items: [], layout: 'row', size: 'column', caption: '' };
    case 'tip':
      return { id, type: 'tip', title: 'Travel hack', body: emptyRichText() };
    case 'list':
      return { id, type: 'list', groups: [{ name: '', items: [{ name: '', note: '' }] }] };
    case 'clip':
      return { id, type: 'clip', videoId: '', caption: '' };
    case 'embed':
      return { id, type: 'embed', url: '', caption: '' };
    case 'quote':
      return { id, type: 'quote', text: '' };
    case 'divider':
      return { id, type: 'divider' };
  }
}

export function insertBlocks(blocks: Block[], at: number, added: Block[]): Block[] {
  const index = Math.max(0, Math.min(at, blocks.length));
  return [...blocks.slice(0, index), ...added, ...blocks.slice(index)];
}

/** Swaps a block with its neighbour; a move off either end is a no-op. */
export function moveBlock(blocks: Block[], id: string, delta: -1 | 1): Block[] {
  const from = blocks.findIndex((block) => block.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= blocks.length) return blocks;
  const next = blocks.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Moves a block into a gap — 0 above the first block, `blocks.length` below the
 * last — counted in the list as it stands before the move, because that is what
 * the drop line is drawn against. The gaps directly above and below a block are
 * both where it already is, so a drop into either is a no-op.
 */
export function moveBlockTo(blocks: Block[], id: string, gap: number): Block[] {
  const from = blocks.findIndex((block) => block.id === id);
  if (from < 0 || isNoopDrop(from, gap)) return blocks;
  const next = blocks.slice();
  const [moved] = next.splice(from, 1);
  // Taking the block out closes its gap, so every gap below it moves up by one.
  const at = gap > from ? gap - 1 : gap;
  next.splice(Math.min(Math.max(at, 0), next.length), 0, moved);
  return next;
}

export function isNoopDrop(from: number, gap: number): boolean {
  return gap === from || gap === from + 1;
}

/**
 * The gap a dragged block is pointing at: how many blocks' midpoints sit above
 * the pointer. Measured against every block rather than the one under the
 * pointer, so the space between blocks — the insert points — still lands
 * somewhere instead of refusing the drop.
 */
export function dropGap(midpoints: number[], pointerY: number): number {
  return midpoints.filter((middle) => middle < pointerY).length;
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((block) => block.id !== id);
}

/** Replaces one block's fields, keeping its type — a patch cannot turn a tip into a photo. */
export function updateBlock<T extends Block['type']>(
  blocks: Block[],
  id: string,
  type: T,
  patch: Partial<Omit<BlockOf<T>, 'id' | 'type'>>,
): Block[] {
  return blocks.map((block) => (block.id === id && block.type === type ? ({ ...block, ...patch } as Block) : block));
}

function sameRef(a: PhotoRef, b: PhotoRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'external' && b.kind === 'external') return a.url === b.url;
  return 'id' in a && 'id' in b && a.id === b.id;
}

export interface AddedPhotos {
  blocks: Block[];
  /** The block the photos landed in, to select it. */
  blockId: string;
}

/**
 * Puts photos into the post: into `targetId`'s photos block when there is one
 * (skipping any it already holds), otherwise into a new block after `afterId`,
 * or at the end. An empty block takes the layout that suits what it receives.
 */
export function addPhotos(
  blocks: Block[],
  refs: PhotoRef[],
  options: { targetId?: string | null; afterId?: string | null },
): AddedPhotos {
  const target = blocks.find(
    (block): block is BlockOf<'photos'> => block.id === options.targetId && block.type === 'photos',
  );

  if (target) {
    const items = [...target.items, ...refs.filter((ref) => !target.items.some((have) => sameRef(have, ref)))];
    const layout = target.items.length ? target.layout : autoLayout(items.length);
    return { blocks: updateBlock(blocks, target.id, 'photos', { items, layout }), blockId: target.id };
  }

  const block: Block = {
    id: newBlockId(),
    type: 'photos',
    items: refs,
    layout: autoLayout(refs.length),
    size: 'column',
    caption: '',
  };
  const after = blocks.findIndex((candidate) => candidate.id === options.afterId);
  return { blocks: insertBlocks(blocks, after < 0 ? blocks.length : after + 1, [block]), blockId: block.id };
}

/** Drops references to deleted tray photos from every photos block. */
export function removePhotoRefs(blocks: Block[], kind: 'journal' | 'still', ids: string[]): Block[] {
  const gone = new Set(ids);
  return blocks.map((block) => {
    if (block.type !== 'photos') return block;
    const items = block.items.filter((ref) => !(ref.kind === kind && gone.has(ref.id)));
    return items.length === block.items.length ? block : { ...block, items };
  });
}

/** Moves one photo within its block, for reordering a row or a carousel. */
export function movePhoto(blocks: Block[], blockId: string, index: number, delta: -1 | 1): Block[] {
  return blocks.map((block) => {
    if (block.id !== blockId || block.type !== 'photos') return block;
    const to = index + delta;
    if (index < 0 || to < 0 || to >= block.items.length) return block;
    const items = block.items.slice();
    [items[index], items[to]] = [items[to], items[index]];
    return { ...block, items };
  });
}

/** The journal photo ids a post's blocks use, for marking them "in post" in the tray. */
export function usedJournalPhotos(blocks: Block[]): Set<string> {
  const used = new Set<string>();
  for (const block of blocks) {
    if (block.type !== 'photos') continue;
    for (const ref of block.items) if (ref.kind === 'journal') used.add(ref.id);
  }
  return used;
}

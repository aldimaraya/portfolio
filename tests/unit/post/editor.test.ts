import { describe, expect, it } from 'vitest';
import { blockSchema, type Block } from '@/lib/post/content';
import {
  addPhotos,
  INSERTABLE,
  insertBlocks,
  dropGap,
  makeBlock,
  moveBlock,
  moveBlockTo,
  movePhoto,
  removeBlock,
  removePhotoRefs,
  updateBlock,
  usedJournalPhotos,
} from '@/lib/post/editor';

const divider = (id: string): Block => ({ id, type: 'divider' });
const photos = (id: string, ids: string[]): Block => ({
  id,
  type: 'photos',
  items: ids.map((photoId) => ({ kind: 'journal', id: photoId })),
  layout: 'row',
  size: 'column',
  caption: '',
});

describe('makeBlock', () => {
  it('makes a valid block for everything the menu offers', () => {
    for (const kind of INSERTABLE) {
      expect(blockSchema.safeParse(makeBlock(kind)).success, kind).toBe(true);
    }
  });

  it('makes a day as a numbered section and a section as a plain one', () => {
    expect(makeBlock('day')).toMatchObject({ type: 'section', numbered: true });
    expect(makeBlock('section')).toMatchObject({ type: 'section', numbered: false });
  });
});

describe('block list edits', () => {
  const blocks = [divider('a'), divider('b'), divider('c')];

  it('inserts at a position, clamped to the list', () => {
    expect(insertBlocks(blocks, 1, [divider('x')]).map((b) => b.id)).toEqual(['a', 'x', 'b', 'c']);
    expect(insertBlocks(blocks, 99, [divider('x')]).map((b) => b.id)).toEqual(['a', 'b', 'c', 'x']);
  });

  it('moves a block one place, and not off either end', () => {
    expect(moveBlock(blocks, 'b', -1).map((b) => b.id)).toEqual(['b', 'a', 'c']);
    expect(moveBlock(blocks, 'a', -1)).toBe(blocks);
    expect(moveBlock(blocks, 'c', 1)).toBe(blocks);
  });

  it('drops a block into a gap counted before the move', () => {
    const ids = (next: Block[]) => next.map((b) => b.id);
    expect(ids(moveBlockTo(blocks, 'a', 3))).toEqual(['b', 'c', 'a']);
    expect(ids(moveBlockTo(blocks, 'a', 2))).toEqual(['b', 'a', 'c']);
    expect(ids(moveBlockTo(blocks, 'c', 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveBlockTo(blocks, 'c', 1))).toEqual(['a', 'c', 'b']);
  });

  it('leaves the list alone for a drop beside the block itself, or an unknown id', () => {
    expect(moveBlockTo(blocks, 'b', 1)).toBe(blocks);
    expect(moveBlockTo(blocks, 'b', 2)).toBe(blocks);
    expect(moveBlockTo(blocks, 'x', 0)).toBe(blocks);
  });

  it('points at the gap below every midpoint above the pointer', () => {
    const middles = [100, 300, 500];
    expect(dropGap(middles, 50)).toBe(0);
    expect(dropGap(middles, 200)).toBe(1);
    expect(dropGap(middles, 450)).toBe(2);
    expect(dropGap(middles, 900)).toBe(3);
  });

  it('removes by id', () => {
    expect(removeBlock(blocks, 'b').map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('updates only a block of the named type', () => {
    const list: Block[] = [{ id: 'q', type: 'quote', text: 'old' }];
    expect(updateBlock(list, 'q', 'quote', { text: 'new' })[0]).toEqual({ id: 'q', type: 'quote', text: 'new' });
    expect(updateBlock(list, 'q', 'heading', { text: 'new' })[0]).toEqual(list[0]);
  });
});

describe('addPhotos', () => {
  it('fills the target block, skipping photos it already holds', () => {
    const result = addPhotos([photos('p', ['1'])], [{ kind: 'journal', id: '1' }, { kind: 'journal', id: '2' }], { targetId: 'p' });
    expect(result.blockId).toBe('p');
    expect(result.blocks[0]).toMatchObject({ items: [{ id: '1' }, { id: '2' }], layout: 'row' });
  });

  it('gives an empty target the layout that suits what it receives', () => {
    const result = addPhotos([photos('p', [])], ['1', '2', '3', '4'].map((id) => ({ kind: 'journal' as const, id })), { targetId: 'p' });
    expect(result.blocks[0]).toMatchObject({ layout: 'grid' });
  });

  it('otherwise adds a new block after the selected one, or at the end', () => {
    const after = addPhotos([divider('a'), divider('b')], [{ kind: 'still', id: 's' }], { afterId: 'a' });
    expect(after.blocks.map((b) => b.type)).toEqual(['divider', 'photos', 'divider']);
    expect(after.blocks[1]).toMatchObject({ id: after.blockId, layout: 'stacked', items: [{ kind: 'still', id: 's' }] });

    const end = addPhotos([divider('a')], [{ kind: 'still', id: 's' }], {});
    expect(end.blocks.map((b) => b.type)).toEqual(['divider', 'photos']);
  });
});

describe('photo references', () => {
  it('drops deleted photos from every block, of the right kind only', () => {
    const blocks: Block[] = [
      photos('p', ['1', '2']),
      { id: 'q', type: 'photos', items: [{ kind: 'still', id: '1' }], layout: 'row', size: 'column', caption: '' },
    ];
    const next = removePhotoRefs(blocks, 'journal', ['1']);
    expect(next[0]).toMatchObject({ items: [{ id: '2' }] });
    expect(next[1]).toBe(blocks[1]);
  });

  it('reorders a photo within its block', () => {
    const [moved] = movePhoto([photos('p', ['1', '2', '3'])], 'p', 0, 1);
    expect(moved.type === 'photos' && moved.items.map((ref) => ('id' in ref ? ref.id : ''))).toEqual(['2', '1', '3']);
  });

  it('lists the journal photos in use', () => {
    expect([...usedJournalPhotos([photos('p', ['1']), photos('q', ['2', '1'])])].sort()).toEqual(['1', '2']);
  });
});

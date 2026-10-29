import type { Block } from '@/lib/post/content';
import type { PostMedia } from '@/lib/post/media';
import { sectionEntries } from '@/lib/post/sections';
import { PostBlock, rowAnchor, rowClass, SectionMargin } from './PostBlock';

/** A published post's blocks, each on its row of the sheet. */
export function PostBody({ blocks, media }: { blocks: Block[]; media: PostMedia }) {
  const sections = new Map(sectionEntries(blocks).map((entry) => [entry.id, entry]));

  return (
    <>
      {blocks.map((block) => (
        <div key={block.id} id={rowAnchor(block)} className={rowClass(block)}>
          <div className="post-margin">
            {block.type === 'section' ? (
              <SectionMargin entry={sections.get(block.id)} />
            ) : block.type === 'text' && block.tag ? (
              <span className="post-margin-tag">{block.tag}</span>
            ) : null}
          </div>
          <div className="post-cell">
            <PostBlock block={block} media={media} />
          </div>
        </div>
      ))}
    </>
  );
}

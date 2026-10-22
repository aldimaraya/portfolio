'use client';

import type { ReactNode } from 'react';
import { BulbIcon, Embed, PostBlock, rowAnchor, rowClass } from '@/components/journal/PostBlock';
import { PostPhotos } from '@/components/journal/PostPhotos';
import { PHOTO_LAYOUTS, PHOTO_SIZES, type Block, type BlockOf, type PhotoLayout, type PhotoSize } from '@/lib/post/content';
import { movePhoto } from '@/lib/post/editor';
import { resolvePhoto, type PostMedia, type ResolvedClip } from '@/lib/post/media';
import { defaultLabel, type SectionEntry } from '@/lib/post/sections';
import { promptForTag } from '@/lib/post/trip';
import { BlockToolbar, Segmented, ToolButton } from './BlockToolbar';
import { GrowingText, useLibrary } from './fields';
import { RichTextContent, RichTextTools, useRichTextEditor } from './RichTextField';

export interface EditorBlockProps {
  block: Block;
  /** The section's derived label and day number; sections only. */
  entry?: SectionEntry;
  media: PostMedia;
  selected: boolean;
  onSelect: () => void;
  onChange: (block: Block) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  /** Opens the photo tray to fill this block. */
  onChoosePhotos: () => void;
  /** A clip picked from the reel, so the editor can resolve it without a reload. */
  onClipChosen: (id: string, clip: ResolvedClip) => void;
}

const LAYOUT_LABELS: Record<PhotoLayout, string> = { stacked: 'Stacked', row: 'Row', grid: 'Grid', carousel: 'Carousel' };
const SIZE_LABELS: Record<PhotoSize, string> = { column: 'Column', wide: 'Wide', full: 'Full width' };

/** One block on the editing sheet: the same row the published page draws, made editable. */
export function EditorBlock(props: EditorBlockProps) {
  switch (props.block.type) {
    case 'section':
      return <SectionEditor {...props} block={props.block} />;
    case 'text':
      return <TextEditor {...props} block={props.block} />;
    case 'heading':
      return (
        <Row {...props} label="Heading">
          <GrowingText
            singleLine
            label="Heading"
            value={props.block.text}
            placeholder="A heading"
            className="post-heading"
            onChange={(text) => props.onChange({ ...(props.block as BlockOf<'heading'>), text })}
          />
        </Row>
      );
    case 'photos':
      return <PhotosEditor {...props} block={props.block} />;
    case 'tip':
      return <TipEditor {...props} block={props.block} />;
    case 'list':
      return <ListEditor {...props} block={props.block} />;
    case 'clip':
      return <ClipEditor {...props} block={props.block} />;
    case 'embed':
      return <EmbedEditor {...props} block={props.block} />;
    case 'quote':
      return (
        <Row {...props} label="Quote">
          <GrowingText
            label="Quote"
            value={props.block.text}
            placeholder="A line worth pulling out"
            className="post-quote"
            onChange={(text) => props.onChange({ ...(props.block as BlockOf<'quote'>), text })}
          />
        </Row>
      );
    case 'divider':
      return (
        <Row {...props} label="Divider">
          <hr className="post-divider" />
        </Row>
      );
  }
}

/** The row every block sits in, with its selection outline and toolbar. */
function Row({
  block,
  selected,
  onSelect,
  onMove,
  onDelete,
  label,
  tools,
  margin,
  children,
}: EditorBlockProps & { label: string; tools?: ReactNode; margin?: ReactNode; children: ReactNode }) {
  return (
    <div id={rowAnchor(block)} className={`${rowClass(block)} editor-row`}>
      <div className="post-margin">{margin}</div>
      <div
        className="post-cell editor-cell"
        data-selected={selected || undefined}
        onMouseDownCapture={() => {
          if (!selected) onSelect();
        }}
        onFocusCapture={() => {
          if (!selected) onSelect();
        }}
      >
        {selected ? (
          <BlockToolbar label={label} onUp={() => onMove(-1)} onDown={() => onMove(1)} onDelete={onDelete}>
            {tools}
          </BlockToolbar>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function SectionEditor(props: EditorBlockProps & { block: BlockOf<'section'> }) {
  const { block, entry, selected, onChange } = props;
  const fallback = entry ? defaultLabel(entry) : '';
  const set = (patch: Partial<BlockOf<'section'>>) => onChange({ ...block, ...patch });
  // A day always offers its date and place; a plain section only once it has
  // one, or while it is selected — "Packing" has no date to add.
  const showMeta = block.numbered || selected;

  return (
    <Row
      {...props}
      label={block.numbered ? 'Day' : 'Section'}
      tools={
        <>
          <Segmented
            label="Kind"
            value={block.numbered ? 'day' : 'plain'}
            options={[
              ['day', 'Numbered day'],
              ['plain', 'Plain section'],
            ]}
            onChange={(kind) => set({ numbered: kind === 'day' })}
          />
          {block.numbered && block.label && fallback ? (
            <ToolButton label={`Back to ${fallback}`} onClick={() => set({ label: '' })}>
              Back to {fallback}
            </ToolButton>
          ) : null}
        </>
      }
      margin={
        <>
          <GrowingText
            singleLine
            label="Section label"
            value={block.label}
            // A day's number shows as the placeholder, in the label's own colour:
            // it reads as the label, and typing over it renames the day without
            // taking it out of the count.
            placeholder={fallback || 'Name it'}
            className={fallback ? 'post-margin-label editor-margin-input editor-margin-default' : 'post-margin-label editor-margin-input'}
            onChange={(label) => set({ label })}
          />
          {showMeta || block.date ? (
            <GrowingText singleLine label="Date" value={block.date} placeholder="Add date" className="post-margin-meta editor-margin-input" onChange={(date) => set({ date })} />
          ) : null}
          {showMeta || block.place ? (
            <GrowingText singleLine label="Place" value={block.place} placeholder="Add place" className="post-margin-meta editor-margin-input" onChange={(place) => set({ place })} />
          ) : null}
        </>
      }
    >
      <GrowingText
        singleLine
        label="Section title"
        value={block.title}
        placeholder={block.numbered ? 'What happened that day?' : 'Section title'}
        className="post-section-title"
        onChange={(title) => set({ title })}
      />
    </Row>
  );
}

function TextEditor(props: EditorBlockProps & { block: BlockOf<'text'> }) {
  const { block, onChange } = props;
  const editor = useRichTextEditor({
    value: block.body,
    onChange: (body) => onChange({ ...block, body }),
    placeholder: promptForTag(block.tag) ?? 'Start writing…',
  });

  return (
    <Row
      {...props}
      label="Text"
      tools={<RichTextTools editor={editor} />}
      margin={
        block.tag ? (
          <span className="post-margin-tag editor-tag">
            {block.tag}
            <button
              type="button"
              aria-label={`Remove the ${block.tag} label`}
              onClick={() => onChange({ ...block, tag: undefined })}
            >
              ×
            </button>
          </span>
        ) : null
      }
    >
      <RichTextContent editor={editor} />
    </Row>
  );
}

function PhotosEditor(props: EditorBlockProps & { block: BlockOf<'photos'> }) {
  const { block, media, selected, onChange, onChoosePhotos } = props;
  const set = (patch: Partial<BlockOf<'photos'>>) => onChange({ ...block, ...patch });

  return (
    <Row
      {...props}
      label="Photos"
      tools={
        <>
          <Segmented<PhotoLayout>
            label="Layout"
            value={block.layout}
            options={PHOTO_LAYOUTS.map((layout) => [layout, LAYOUT_LABELS[layout]] as const)}
            onChange={(layout) => set({ layout })}
          />
          <Segmented<PhotoSize>
            label="Size"
            value={block.size}
            options={PHOTO_SIZES.map((size) => [size, SIZE_LABELS[size]] as const)}
            onChange={(size) => set({ size })}
          />
          <ToolButton label="Add photos" onClick={onChoosePhotos}>
            Add photos
          </ToolButton>
        </>
      }
    >
      {block.items.length === 0 ? (
        <div className="editor-empty">
          <p>No photos yet. Pick some from the trip photos, or upload them there.</p>
          <button type="button" className="editor-button" onClick={onChoosePhotos}>
            Choose photos
          </button>
        </div>
      ) : (
        <>
          {/* The caption is edited below while selected, so it is left off the
              mat here rather than shown twice. */}
          <PostPhotos block={selected ? { ...block, caption: '' } : block} media={media} />
          {selected ? (
            <div className="editor-photo-panel">
              <GrowingText
                singleLine
                label="Caption"
                value={block.caption}
                placeholder="Add a caption — it is also the alt text"
                className="editor-caption"
                onChange={(caption) => set({ caption })}
              />
              <ol className="editor-photo-strip" aria-label="Photos in this block">
                {block.items.map((ref, index) => {
                  const image = resolvePhoto(ref, media);
                  return (
                    <li key={`${index}-${image?.url ?? 'missing'}`}>
                      {image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={image.url} alt="" loading="lazy" />
                      ) : (
                        <span className="editor-photo-missing">Deleted</span>
                      )}
                      <div>
                        <button type="button" aria-label="Move photo earlier" disabled={index === 0} onClick={() => onChange(movePhoto([block], block.id, index, -1)[0])}>
                          ←
                        </button>
                        <button
                          type="button"
                          aria-label="Move photo later"
                          disabled={index === block.items.length - 1}
                          onClick={() => onChange(movePhoto([block], block.id, index, 1)[0])}
                        >
                          →
                        </button>
                        <button type="button" aria-label="Take photo out of this block" onClick={() => set({ items: block.items.filter((_, other) => other !== index) })}>
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </>
      )}
    </Row>
  );
}

function TipEditor(props: EditorBlockProps & { block: BlockOf<'tip'> }) {
  const { block, onChange } = props;
  const editor = useRichTextEditor({
    value: block.body,
    onChange: (body) => onChange({ ...block, body }),
    placeholder: 'The thing you wish someone had told you',
  });

  return (
    <Row {...props} label="Tip" tools={<RichTextTools editor={editor} />}>
      <aside className="post-tip">
        <div className="post-tip-title">
          <BulbIcon />
          <GrowingText
            singleLine
            label="Tip heading"
            value={block.title}
            placeholder="Tip"
            className="editor-tip-title"
            onChange={(title) => onChange({ ...block, title })}
          />
        </div>
        <RichTextContent editor={editor} />
      </aside>
    </Row>
  );
}

function ListEditor(props: EditorBlockProps & { block: BlockOf<'list'> }) {
  const { block, selected, onChange } = props;
  const groups = block.groups;
  const setGroups = (next: BlockOf<'list'>['groups']) => onChange({ ...block, groups: next });
  const setGroup = (index: number, patch: Partial<BlockOf<'list'>['groups'][number]>) =>
    setGroups(groups.map((group, other) => (other === index ? { ...group, ...patch } : group)));

  return (
    <Row {...props} label="List">
      <div className="post-list">
        {groups.map((group, groupIndex) => (
          <section key={groupIndex} className="post-list-group">
            <h4>
              <GrowingText
                singleLine
                label="Group name"
                value={group.name}
                placeholder="Group, e.g. Bag"
                className="editor-list-group"
                onChange={(name) => setGroup(groupIndex, { name })}
              />
            </h4>
            <ul>
              {group.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <GrowingText
                    singleLine
                    label="Item"
                    value={item.name}
                    placeholder="Item"
                    className="post-list-name"
                    onChange={(name) =>
                      setGroup(groupIndex, { items: group.items.map((other, at) => (at === itemIndex ? { ...other, name } : other)) })
                    }
                  />
                  <GrowingText
                    label="Why it earns its place"
                    value={item.note}
                    placeholder="Why it earns its place"
                    className="post-list-note"
                    onChange={(note) =>
                      setGroup(groupIndex, { items: group.items.map((other, at) => (at === itemIndex ? { ...other, note } : other)) })
                    }
                  />
                  {selected ? (
                    <button
                      type="button"
                      className="editor-remove"
                      aria-label="Remove item"
                      onClick={() => {
                        const items = group.items.filter((_, at) => at !== itemIndex);
                        // The last item of a group takes the group with it.
                        setGroups(items.length ? groups.map((other, at) => (at === groupIndex ? { ...other, items } : other)) : groups.filter((_, at) => at !== groupIndex));
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {selected ? (
              <button type="button" className="editor-link-button" onClick={() => setGroup(groupIndex, { items: [...group.items, { name: '', note: '' }] })}>
                + Add item
              </button>
            ) : null}
          </section>
        ))}
        {selected || groups.length === 0 ? (
          <button type="button" className="editor-button" onClick={() => setGroups([...groups, { name: '', items: [{ name: '', note: '' }] }])}>
            + Add a group
          </button>
        ) : null}
      </div>
    </Row>
  );
}

function ClipEditor(props: EditorBlockProps & { block: BlockOf<'clip'> }) {
  const { block, media, onChange, onClipChosen } = props;
  const chosen = block.videoId ? media.clips[block.videoId] : undefined;
  const library = useLibrary(!chosen);

  return (
    <Row
      {...props}
      label="Clip"
      tools={
        chosen ? (
          <ToolButton label="Change clip" onClick={() => onChange({ ...block, videoId: '' })}>
            Change clip
          </ToolButton>
        ) : null
      }
    >
      {chosen ? (
        <>
          <PostBlock block={{ ...block, caption: block.caption || chosen.title }} media={media} />
          <GrowingText
            singleLine
            label="Caption"
            value={block.caption}
            placeholder={chosen.title ? `Caption (defaults to “${chosen.title}”)` : 'Caption'}
            className="editor-caption"
            onChange={(caption) => onChange({ ...block, caption })}
          />
        </>
      ) : (
        <div className="editor-empty">
          <p>Pick a clip from Motion.</p>
          {!library ? (
            <p className="editor-muted">Loading clips…</p>
          ) : library.videos.length === 0 ? (
            <p className="editor-muted">There are no clips yet.</p>
          ) : (
            <div className="editor-pick-grid">
              {library.videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  title={video.title}
                  onClick={() => {
                    onClipChosen(video.id, video);
                    onChange({ ...block, videoId: video.id });
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.posterImageUrl} alt={video.title} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Row>
  );
}

function EmbedEditor(props: EditorBlockProps & { block: BlockOf<'embed'> }) {
  const { block, onChange } = props;
  return (
    <Row {...props} label="Embed">
      <div className="editor-embed">
        <GrowingText
          singleLine
          label="YouTube link"
          value={block.url}
          placeholder="Paste a YouTube link — https://youtu.be/…"
          className="editor-url"
          onChange={(url) => onChange({ ...block, url: url.trim() })}
        />
        <Embed block={{ ...block, caption: '' }} />
        {block.url ? (
          <GrowingText singleLine label="Caption" value={block.caption} placeholder="Caption" className="editor-caption" onChange={(caption) => onChange({ ...block, caption })} />
        ) : null}
      </div>
    </Row>
  );
}

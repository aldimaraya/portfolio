'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { PostBody } from '@/components/journal/PostBody';
import { PostSheet } from '@/components/journal/PostSheet';
import { deletePost, savePost, type JournalPhotoRow } from '@/app/admin/posts/actions';
import type { Block, PhotoRef } from '@/lib/post/content';
import { formatPostDate } from '@/lib/post/date';
import {
  addPhotos,
  dropGap,
  insertBlocks,
  isNoopDrop,
  makeBlock,
  moveBlock,
  moveBlockTo,
  moveSection,
  removeBlock,
  removePhotoRefs,
  usedJournalPhotos,
  type Insertable,
} from '@/lib/post/editor';
import { missingForPublish } from '@/lib/post/form';
import { firstImage, type PostMedia, type ResolvedClip, type ResolvedImage } from '@/lib/post/media';
import { indexEntries, sectionEntries, unwrittenSections } from '@/lib/post/sections';
import { insertionPointForDays, layoutMissingDays, type TrayPhoto } from '@/lib/post/trip';
import { slugify } from '@/lib/slug';
import { Icon } from '@/components/admin/shell/Icon';
import { EditorBlock } from './EditorBlock';
import { EditorOutline } from './EditorOutline';
import { GrowingText } from './fields';
import { InsertPoint } from './InsertMenu';
import { PhotoTray } from './PhotoTray';

export interface EditorPost {
  id: string;
  slug: string;
  title: string;
  draft: boolean;
  publishedAt: Date;
}

interface Props {
  post: EditorPost;
  blocks: Block[];
  /** Stills and clips the blocks use; journal photos come from `trayPhotos`. */
  media: Pick<PostMedia, 'stills' | 'clips'>;
  trayPhotos: TrayPhoto[];
  /** The post is still Markdown, shown converted; the first save stores the blocks. */
  converted: boolean;
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; message: string };

interface Toast {
  message: string;
  undo?: () => void;
}

/**
 * The journal editor: the post drawn on the same sheet it is published on, with
 * each block editable in place, its outline on the left and its trip photos in
 * a tray on the right. Below 80rem the tray becomes a drawer and below 64rem
 * the outline goes (the sheet's own index stands in), so the sheet never drops
 * under the width the post is read at on a laptop.
 *
 * It owns the post's state; every decision about what an edit does to the
 * blocks is a pure function in lib/post/editor.ts. Saving is explicit — Save,
 * or ⌘S — because a published post would otherwise go live keystroke by
 * keystroke; leaving with unsaved changes asks first.
 */
export function PostEditor({ post, blocks: initialBlocks, media: initialMedia, trayPhotos: initialTray, converted }: Props) {
  const [title, setTitle] = useState(post.title);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [draft, setDraft] = useState(post.draft);
  const [slug, setSlug] = useState(post.slug);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt);
  const [library, setLibrary] = useState(initialMedia);
  const [trayPhotos, setTrayPhotos] = useState(initialTray);

  const [selected, setSelected] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  // The block being dragged by its handle, and the gap it would land in.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [tray, setTray] = useState<{ open: boolean; target: string | null }>({ open: false, target: null });
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [toast, setToast] = useState<Toast | null>(null);

  // What was last saved, to tell whether there is anything to save. A post
  // shown converted from Markdown has never been saved as blocks, so it starts
  // dirty: saving it is what moves it onto the new format.
  const snapshot = (nextTitle: string, nextBlocks: Block[]) => JSON.stringify([nextTitle, nextBlocks]);
  const [saved, setSaved] = useState(() => (converted ? '' : snapshot(post.title, initialBlocks)));
  const dirty = snapshot(title, blocks) !== saved;

  const media: PostMedia = useMemo(
    () => ({
      ...library,
      journal: Object.fromEntries(
        trayPhotos.map((photo) => [photo.id, { url: photo.imageUrl, width: photo.width, height: photo.height, alt: '' }]),
      ),
    }),
    [library, trayPhotos],
  );

  const sections = useMemo(() => new Map(sectionEntries(blocks).map((entry) => [entry.id, entry])), [blocks]);
  const index = useMemo(() => indexEntries(blocks), [blocks]);
  const used = useMemo(() => usedJournalPhotos(blocks), [blocks]);
  const unwritten = useMemo(() => new Set(unwrittenSections(blocks)), [blocks]);
  const cover = useMemo(() => firstImage(blocks, media), [blocks, media]);
  // The section the selected block sits in: the last one at or above it.
  const currentSection = useMemo(() => {
    const at = blocks.findIndex((block) => block.id === selected);
    for (let i = at; i >= 0; i -= 1) if (blocks[i].type === 'section') return blocks[i].id;
    return null;
  }, [blocks, selected]);
  const missing = missingForPublish({ title, content: { version: 1, blocks } });

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((next: Toast) => {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), next.undo ? 8000 : 4000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── Saving ────────────────────────────────────────────────────────────────

  const persist = useCallback(
    async (nextDraft: boolean) => {
      const sent = snapshot(title, blocks);
      setSave({ kind: 'saving' });
      const result = await savePost({ id: post.id, title, content: { version: 1, blocks }, draft: nextDraft });
      if (result.error) {
        setSave({ kind: 'error', message: result.error });
        return;
      }
      if (draft && !nextDraft) setPublishedAt(new Date());
      setSaved(sent);
      setDraft(nextDraft);
      if (result.slug) setSlug(result.slug);
      setSave({ kind: 'saved', at: new Date() });
    },
    [blocks, draft, post.id, title],
  );

  // ⌘S / Ctrl+S saves without changing whether the post is published.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persist(draft);
      }
      if (event.key === 'Escape') {
        setInsertAt(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, persist]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── Editing ───────────────────────────────────────────────────────────────

  function change(block: Block) {
    setBlocks((current) => current.map((other) => (other.id === block.id ? block : other)));
  }

  function insert(kind: Insertable, at: number) {
    const block = makeBlock(kind);
    setBlocks((current) => insertBlocks(current, at, [block]));
    setInsertAt(null);
    setSelected(block.id);
    if (block.type === 'photos') setTray({ open: true, target: block.id });
  }

  function remove(id: string) {
    const at = blocks.findIndex((block) => block.id === id);
    const removed = blocks[at];
    if (!removed) return;
    setBlocks((current) => removeBlock(current, id));
    setSelected(null);
    if (tray.target === id) setTray((current) => ({ ...current, target: null }));
    flash({
      message: 'Block deleted.',
      undo: () => {
        setBlocks((current) => insertBlocks(current, at, [removed]));
        setToast(null);
      },
    });
  }

  function addFromTray(refs: PhotoRef[], stills?: Record<string, ResolvedImage>) {
    if (!refs.length) return;
    if (stills) setLibrary((current) => ({ ...current, stills: { ...current.stills, ...stills } }));
    const result = addPhotos(blocks, refs, { targetId: tray.target, afterId: selected });
    setBlocks(result.blocks);
    setSelected(result.blockId);
    setTray((current) => ({ ...current, target: null }));
    flash({ message: `Added ${refs.length} ${refs.length === 1 ? 'photo' : 'photos'}. Change the layout from the bar above the block.` });
    requestAnimationFrame(() => document.getElementById(`block-${result.blockId}`)?.scrollIntoView({ block: 'center' }));
  }

  function layoutDays() {
    const laid = layoutMissingDays(trayPhotos, blocks);
    if (!laid.days) {
      flash({ message: 'Every day in the trip photos already has a section in the post.' });
      return;
    }
    setBlocks((current) => insertBlocks(current, insertionPointForDays(current), laid.blocks));
    setTray({ open: false, target: null });
    setSelected(null);
    flash({
      message: `Laid out ${laid.days} ${laid.days === 1 ? 'day' : 'days'} from ${laid.photos} photos, split by category. Fill in the words.`,
    });
  }

  function jumpTo(id: string) {
    setMode('edit');
    setSelected(id);
    document.getElementById(`block-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function endDrag() {
    setDragging(null);
    setDropAt(null);
  }

  /** The gap under the pointer, from the rows as they are drawn right now. */
  function gapAtPointer(event: DragEvent<HTMLElement>) {
    const rows = event.currentTarget.querySelectorAll<HTMLElement>(':scope > .editor-row');
    const middles = [...rows].map((row) => {
      const box = row.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    return dropGap(middles, event.clientY);
  }

  const dragFrom = dragging ? blocks.findIndex((block) => block.id === dragging) : -1;
  const pendingDrop = dragFrom >= 0 && dropAt !== null && !isNoopDrop(dragFrom, dropAt) ? dropAt : null;

  const targetBlock = tray.target ? blocks.find((block) => block.id === tray.target) : undefined;

  /** "Click to add to the selected row in Day 1": which block, and where it is. */
  function targetLabel(block: Block): string {
    const layout = block.type === 'photos' ? block.layout : 'block';
    const at = blocks.indexOf(block);
    let section: string | null = null;
    for (let i = at; i >= 0 && section === null; i -= 1) {
      const entry = blocks[i].type === 'section' ? sections.get(blocks[i].id) : undefined;
      if (entry) section = entry.label || entry.title || null;
    }
    return `Click to add to the selected ${layout}${section ? ` in ${section}` : ''}`;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  const status =
    save.kind === 'saving'
      ? 'Saving…'
      : save.kind === 'error'
        ? save.message
        : dirty
          ? converted && !saved
            ? 'Converted from Markdown — save to keep it'
            : 'Unsaved changes'
          : save.kind === 'saved'
            ? `Saved ${save.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
            : 'Saved';

  const liveSlug = draft ? slugify(title || 'Untitled') : slug;

  return (
    <div className="editor-shell">
      {/* One bar, three jobs: where you are, how it looks, what happens to it. */}
      <header className="editor-bar">
        <Link
          href="/admin/posts"
          className="editor-back"
          onClick={(event) => {
            if (dirty && !window.confirm('Leave without saving your changes?')) event.preventDefault();
          }}
        >
          ← Journal
        </Link>
        <div className="editor-bar-title">
          <span>{title.trim() || 'Untitled'}</span>
          <span className="editor-muted" data-error={save.kind === 'error' || undefined}>
            {draft ? 'Draft' : 'Published'} · {status}
          </span>
        </div>
        <div className="editor-segmented editor-bar-desktop" role="group" aria-label="Mode">
          {(
            [
              ['edit', 'Write'],
              ['preview', 'Preview'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="editor-segmented editor-bar-desktop" role="group" aria-label="Width">
          {(
            [
              ['desktop', 'Desktop width'],
              ['phone', 'Phone width'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-label={label} title={label} aria-pressed={width === id} onClick={() => setWidth(id)}>
              <Icon name={id} size={16} />
            </button>
          ))}
        </div>
        {/* Only where the tray is a drawer; from 80rem it is always open. */}
        <button
          type="button"
          className="editor-button editor-tray-toggle"
          aria-pressed={tray.open}
          onClick={() => {
            setMode('edit');
            setTray((current) => ({ open: !current.open, target: null }));
          }}
        >
          Photos · {trayPhotos.length}
        </button>
        <button type="button" className="editor-button" disabled={save.kind === 'saving' || !dirty} onClick={() => persist(draft)}>
          {draft ? 'Save draft' : 'Update'}
          <kbd className="editor-kbd">⌘S</kbd>
        </button>
        {draft ? (
          <button
            type="button"
            className="editor-primary"
            disabled={save.kind === 'saving' || missing.length > 0}
            title={missing.length ? `Publishing needs ${missing.join(' and ')}` : undefined}
            onClick={() => persist(false)}
          >
            Publish
          </button>
        ) : (
          <button type="button" className="editor-button" disabled={save.kind === 'saving'} onClick={() => persist(true)}>
            Unpublish
          </button>
        )}
      </header>

      <div className="editor-body" data-mode={mode}>
        {mode === 'edit' ? (
          <EditorOutline
            entries={[...sections.values()]}
            unwritten={unwritten}
            current={currentSection}
            onJump={jumpTo}
            onMove={(id, delta) => {
              setBlocks((current) => moveSection(current, id, delta));
              requestAnimationFrame(() => document.getElementById(`block-${id}`)?.scrollIntoView({ block: 'start' }));
            }}
            onAddDay={() => insert('day', blocks.length)}
            onAddSection={() => insert('section', blocks.length)}
            slug={liveSlug}
            draft={draft}
            cover={cover}
          />
        ) : null}

        <div className="editor-canvas">
          <div className={width === 'phone' ? 'editor-phone' : undefined}>
            {mode === 'preview' ? (
              <PostSheet
                frameClassName="post-editing"
                margin={<span>{draft ? 'Not yet published' : formatPostDate(publishedAt)}</span>}
                title={<h1 className="post-title">{title || 'Untitled'}</h1>}
                index={index}
              >
                <PostBody blocks={blocks} media={media} />
              </PostSheet>
            ) : (
              <PostSheet
                frameClassName="post-editing"
                margin={<span>{draft ? 'Draft' : formatPostDate(publishedAt)}</span>}
                title={
                  <>
                    <GrowingText singleLine label="Title" value={title} placeholder="Title" className="post-title" onChange={setTitle} />
                    <p className="editor-slug">
                      /journal/{liveSlug}
                      <span>{draft ? ' · still a draft, so this follows the title' : ' · fixed on publish, so links keep working'}</span>
                    </p>
                  </>
                }
                index={index}
              >
                {blocks.length === 0 ? (
                  <div className="post-row">
                    <div className="post-margin" />
                    <div className="post-cell editor-empty editor-empty--post">
                      <p>Start with a day, or drop the trip&rsquo;s photos into the tray and let it lay the days out for you.</p>
                      <div className="editor-tray-actions">
                        <button type="button" className="editor-button" onClick={() => insert('day', 0)}>
                          Start Day 1
                        </button>
                        <button type="button" className="editor-button editor-button--gold" onClick={() => setTray({ open: true, target: null })}>
                          Open trip photos
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* One drop target for every block, gaps included. Its handlers run
                    in the capture phase and stop there, so a block dragged across
                    a text block never reaches the rich-text editor, which would
                    otherwise draw its own drop caret in the prose. */}
                <div
                  className="editor-blocks"
                  data-dragging={dragging ? '' : undefined}
                  onDragOverCapture={(event) => {
                    if (!dragging) return;
                    // Without preventDefault the drop event never fires.
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'move';
                    const gap = gapAtPointer(event);
                    if (gap !== dropAt) setDropAt(gap);
                  }}
                  onDropCapture={(event) => {
                    if (!dragging) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const gap = gapAtPointer(event);
                    setBlocks((current) => moveBlockTo(current, dragging, gap));
                    endDrag();
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);
                  }}
                >
                  {blocks.map((block, at) => (
                    <Fragment key={block.id}>
                      <div id={`block-${block.id}`} className="editor-block-anchor" />
                      <EditorBlock
                        block={block}
                        entry={sections.get(block.id)}
                        media={media}
                        selected={selected === block.id}
                        onSelect={() => {
                          setSelected(block.id);
                          setInsertAt(null);
                          // With the tray docked open, a selected photo block is
                          // what its photos go into, as if opened from the block.
                          setTray((current) => ({ ...current, target: block.type === 'photos' ? block.id : null }));
                        }}
                        onChange={change}
                        onMove={(delta) => setBlocks((current) => moveBlock(current, block.id, delta))}
                        onDelete={() => remove(block.id)}
                        dragging={dragging === block.id}
                        drop={pendingDrop === at ? 'before' : pendingDrop === at + 1 && at === blocks.length - 1 ? 'after' : undefined}
                        onDragStart={() => {
                          setDragging(block.id);
                          setInsertAt(null);
                        }}
                        onDragEnd={endDrag}
                        onChoosePhotos={() => setTray({ open: true, target: block.id })}
                        onClipChosen={(id: string, clip: ResolvedClip) =>
                          setLibrary((current) => ({ ...current, clips: { ...current.clips, [id]: clip } }))
                        }
                      />
                      {at < blocks.length - 1 ? (
                        <InsertPoint
                          last={false}
                          open={insertAt === at + 1}
                          onToggle={() => setInsertAt((current) => (current === at + 1 ? null : at + 1))}
                          onPick={(kind) => insert(kind, at + 1)}
                        />
                      ) : null}
                    </Fragment>
                  ))}

                  <InsertPoint
                    last
                    open={insertAt === blocks.length}
                    onToggle={() => setInsertAt((current) => (current === blocks.length ? null : blocks.length))}
                    onPick={(kind) => insert(kind, blocks.length)}
                  />
                </div>
              </PostSheet>
            )}
          </div>

          <div className="editor-footer">
            {!draft ? (
              <Link href={`/journal/${slug}`} className="editor-link-button" target="_blank">
                View the published post ↗
              </Link>
            ) : null}
            <DeleteButton id={post.id} action={deletePost} redirectTo="/admin/posts" label="Delete this post" />
          </div>
        </div>

        {/* Mounted through Preview too, hidden by CSS: unmounting it would drop
            uploads still in flight. */}
        <PhotoTray
          open={tray.open}
          postId={post.id}
          photos={trayPhotos}
          used={used}
          targetLabel={targetBlock ? targetLabel(targetBlock) : null}
          onClearTarget={() => setTray((current) => ({ ...current, target: null }))}
          onUploaded={(photo: JournalPhotoRow) => setTrayPhotos((current) => [...current, photo])}
          onFilled={(filled: JournalPhotoRow) =>
            setTrayPhotos((current) => current.map((photo) => (photo.id === filled.id ? filled : photo)))
          }
          onPlaced={(ids, place) =>
            setTrayPhotos((current) => current.map((photo) => (ids.includes(photo.id) ? { ...photo, place } : photo)))
          }
          onTagged={(ids, category) =>
            setTrayPhotos((current) => current.map((photo) => (ids.includes(photo.id) ? { ...photo, category } : photo)))
          }
          onDeleted={(ids) => {
            setTrayPhotos((current) => current.filter((photo) => !ids.includes(photo.id)));
            setBlocks((current) => removePhotoRefs(current, 'journal', ids));
          }}
          onAdd={addFromTray}
          onLayoutDays={layoutDays}
          onClose={() => setTray({ open: false, target: null })}
        />
      </div>

        {toast ? (
          <div role="status" className="editor-toast">
            <span>{toast.message}</span>
            {toast.undo ? (
              <button type="button" onClick={toast.undo}>
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
    </div>
  );
}

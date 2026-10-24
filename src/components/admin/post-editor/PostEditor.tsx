'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { PostBody } from '@/components/journal/PostBody';
import { PostSheet } from '@/components/journal/PostSheet';
import { deletePost, savePost, type JournalPhotoRow } from '@/app/admin/posts/actions';
import type { Block, PhotoRef } from '@/lib/post/content';
import { formatPostDate } from '@/lib/post/date';
import {
  addPhotos,
  insertBlocks,
  makeBlock,
  moveBlock,
  removeBlock,
  removePhotoRefs,
  usedJournalPhotos,
  type Insertable,
} from '@/lib/post/editor';
import { missingForPublish } from '@/lib/post/form';
import type { PostMedia, ResolvedClip, ResolvedImage } from '@/lib/post/media';
import { indexEntries, sectionEntries } from '@/lib/post/sections';
import { insertionPointForDays, layoutMissingDays, type TrayPhoto } from '@/lib/post/trip';
import { slugify } from '@/lib/slug';
import { ToolbarSlot } from './BlockToolbar';
import { EditorBlock } from './EditorBlock';
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
 * each block editable in place, and the post's trip photos in a tray beside it.
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
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [tray, setTray] = useState<{ open: boolean; target: string | null }>({ open: false, target: null });
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [toast, setToast] = useState<Toast | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

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

  const targetBlock = tray.target ? blocks.find((block) => block.id === tray.target) : undefined;

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
    <ToolbarSlot.Provider value={toolbarSlot}>
      <div className="editor-shell">
        <header className="editor-bar">
          <Link
            href="/admin/posts"
            className="editor-back"
            onClick={(event) => {
              if (dirty && !window.confirm('Leave without saving your changes?')) event.preventDefault();
            }}
          >
            ← Posts
          </Link>
          <div className="editor-bar-title">
            <span>{title.trim() || 'Untitled'}</span>
            <span className="editor-muted" data-error={save.kind === 'error' || undefined}>
              {draft ? 'Draft' : 'Published'} · {status}
            </span>
          </div>
          <div className="editor-segmented" role="group" aria-label="Mode">
            {(
              [
                ['edit', 'Edit'],
                ['preview', 'Preview'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="editor-segmented" role="group" aria-label="Width">
            {(
              [
                ['desktop', 'Desktop'],
                ['phone', 'Phone'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={width === id} onClick={() => setWidth(id)}>
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="editor-button"
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
          {mode === 'edit' ? (
            <div className="editor-context" ref={setToolbarSlot}>
              {selected ? null : <span className="editor-muted">Select a block to format it, change its layout, or move it.</span>}
            </div>
          ) : null}
        </header>

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
                indexFooter={
                  <div className="editor-index-actions">
                    <button type="button" className="editor-button" onClick={() => insert('day', blocks.length)}>
                      + Day
                    </button>
                    <button type="button" className="editor-button" onClick={() => insert('section', blocks.length)}>
                      + Section
                    </button>
                  </div>
                }
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
                      }}
                      onChange={change}
                      onMove={(delta) => setBlocks((current) => moveBlock(current, block.id, delta))}
                      onDelete={() => remove(block.id)}
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

        {tray.open && mode === 'edit' ? (
          <PhotoTray
            postId={post.id}
            photos={trayPhotos}
            used={used}
            targetLabel={targetBlock ? 'Adding to the selected photo block' : null}
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
        ) : null}

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
    </ToolbarSlot.Provider>
  );
}

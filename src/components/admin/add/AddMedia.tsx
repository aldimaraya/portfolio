'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { applyBulk, needsDate, problemsOf, sending, tallyQueue, type MediaKind } from '@/lib/admin/drafts';
import type { DraftRow } from '@/lib/admin/load-drafts';
import { formatDuration } from '@/lib/video/duration';
import { listPhrase } from '@/lib/text';
import { BorderTrimmer } from '../BorderTrimmer';
import { AdminPage } from '../shell/AdminPage';
import { Icon } from '../shell/Icon';
import { useAddQueue, type QueueItem } from './AddQueue';
import { SelectField, SuggestField, TagField } from './SuggestField';
import { LocalTrimmer } from './LocalTrimmer';
import { ClipPreview } from './ClipPreview';

export interface RollOption {
  id: string;
  name: string;
}

const INPUT =
  'h-9 w-full min-w-0 rounded-md border bg-film px-2.5 text-sm text-bone outline-none placeholder:text-ash/80 focus:border-gold';
const QUIET = 'border-white/10';
/** The bulk bar sits on film, so its fields take the frame grey to stand off it. */
const BULK = 'border-white/12 bg-frame';

type Options = { places: string[]; cameras: string[]; tags: string[] };
/** A field holding up a publish, or worth a look before one. */
const WANTED = 'border-[#e0a050]';

/** The desktop row: select, thumbnail, file, the fields, status. Stacks below lg. */
const ROW = 'lg:grid lg:grid-cols-[28px_112px_minmax(0,1fr)_minmax(0,2.4fr)_160px] lg:items-start lg:gap-4';

/**
 * Add media: one queue for stills and clips together. Files are read, cut,
 * re-encoded and uploaded the moment they are picked, each landing as a draft
 * that is described here — one at a time in its row, or a selection at once
 * from the bar — and nothing reaches the site until Publish.
 */
export function AddMedia({
  drafts,
  rolls,
  locationOptions,
  cameraOptions,
  tagOptions,
}: {
  drafts: DraftRow[];
  rolls: RollOption[];
  locationOptions: string[];
  cameraOptions: string[];
  tagOptions: string[];
}) {
  const queue = useAddQueue();
  const { items, adopt } = queue;
  const [dragging, setDragging] = useState(0);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  const options = { places: locationOptions, cameras: cameraOptions, tags: tagOptions };

  // Finished uploads from before a refresh, or from another tab. The queue
  // skips any it already holds, so re-rendering after a publish is harmless.
  useEffect(() => adopt(drafts), [drafts, adopt]);

  const stills = items.filter((item) => item.kind === 'still').length;
  const clips = items.length - stills;
  const tally = tallyQueue(items);
  const selected = items.filter((item) => item.selected);
  const publishable = selected.filter((item) => item.stage === 'ready' && !problemsOf(item).length);

  const add = (files: Iterable<File>) => queue.addFiles(files, { rollId: rolls[0]?.id });

  // A drag that starts on this page is never an upload. Chrome hands over an
  // image dragged from the page — a thumbnail, a frame strip — as a File, so
  // without this, dragging a row dropped its own picture back in as a new item.
  const inside = useRef(false);
  useEffect(() => {
    const start = () => (inside.current = true);
    const end = () => (inside.current = false);
    document.addEventListener('dragstart', start);
    document.addEventListener('dragend', end);
    return () => {
      document.removeEventListener('dragstart', start);
      document.removeEventListener('dragend', end);
    };
  }, []);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(0);
    if (inside.current) return;
    add(event.dataTransfer.files);
  }

  async function publish() {
    setOutcome('');
    const result = await queue.publish();
    if ('error' in result) return setOutcome(result.error);
    setOutcome(
      result.refused
        ? `Published ${result.published}. ${result.refused} held back — see their rows.`
        : `Published ${result.published}.`,
    );
  }

  const count = items.length
    ? `${items.length} ${items.length === 1 ? 'file' : 'files'} · ${listPhrase(
        [stills ? `${stills} ${stills === 1 ? 'still' : 'stills'}` : '', clips ? `${clips} ${clips === 1 ? 'clip' : 'clips'}` : ''].filter(Boolean),
      )}`
    : undefined;

  return (
    <AdminPage title="Add media" count={count} actions={items.length ? <Picker compact onPick={add} /> : null} bleed>
      <div
        className="relative flex flex-1 flex-col"
        onDragEnter={(event) => {
          if (!inside.current && event.dataTransfer.types.includes('Files')) setDragging((depth) => depth + 1);
        }}
        onDragLeave={() => setDragging((depth) => Math.max(0, depth - 1))}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        {/* Nothing until the browser's copy is read back, or a refresh would
            flash the empty state before the queue reappears. */}
        {items.length === 0 && !queue.restored ? null : items.length === 0 ? (
          <EmptyState onPick={add} />
        ) : (
          <>
            <BulkBar
              items={items}
              selected={selected}
              rolls={rolls}
              options={options}
            />

            <div className="flex-1 px-4 pb-6 md:px-6">
              <div className={`hidden border-b border-hairline py-2.5 font-mono text-[10px] tracking-[0.15em] text-ash uppercase ${ROW}`}>
                <span />
                <span>File</span>
                <span />
                <span>Details</span>
                <span>Status</span>
              </div>
              <ul>
                {items.map((item) => (
                  <li key={item.key} className="border-b border-white/8 py-3.5">
                    <QueueRow
                      item={item}
                      rolls={rolls}
                      options={options}
                      reviewing={reviewing === item.key}
                      onReview={() => setReviewing(reviewing === item.key ? null : item.key)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <footer className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline bg-film px-4 py-3 md:bottom-0 md:px-6">
              <span className="text-sm text-[#d0d0d4]" aria-live="polite">
                {outcome ||
                  listPhrase(
                    [
                      tally.ready ? `${tally.ready} ready` : '',
                      tally.inProgress ? `${tally.inProgress} in progress` : '',
                      tally.blocked ? `${tally.blocked} need${tally.blocked === 1 ? 's' : ''} details` : '',
                      tally.undated ? `${tally.undated} without a date` : '',
                      tally.failed ? `${tally.failed} failed` : '',
                    ].filter(Boolean),
                  )}
              </span>
              <span className="hidden text-xs text-ash xl:inline">
                {queue.publishing
                  ? 'Uploading — keep this tab open until it finishes. Moving around the admin is fine.'
                  : 'Kept in this browser until you publish — nothing is uploaded before then.'}
              </span>
              <button
                type="button"
                onClick={publish}
                disabled={!publishable.length || queue.publishing}
                className="ml-auto h-10 rounded-lg bg-gold px-4.5 font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
              >
                {queue.publishing ? 'Publishing…' : `Publish ${publishable.length || ''}`.trim()}
              </button>
            </footer>
          </>
        )}

        {dragging > 0 ? (
          <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-gold bg-ink/80 text-gold">
            Drop to add
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}

function Picker({ compact = false, onPick }: { compact?: boolean; onPick: (files: Iterable<File>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (event.target.files) onPick(Array.from(event.target.files));
          // Cleared, so picking the same file again still fires a change.
          event.target.value = '';
        }}
      />
      {compact ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-11 items-center gap-2.5 rounded-lg border border-dashed border-gold/50 px-4 text-sm text-[#d0d0d4] transition hover:border-gold md:ml-auto"
        >
          <Icon name="upload" className="text-gold" />
          <span className="hidden md:inline">Drop more here, or</span>
          <span className="text-gold">browse</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="h-11 rounded-lg bg-gold px-5 font-semibold text-ink transition hover:brightness-110"
        >
          Choose files
        </button>
      )}
    </>
  );
}

function EmptyState({ onPick }: { onPick: (files: Iterable<File>) => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4 md:p-10">
      <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border border-dashed border-gold/40 px-6 py-14 text-center">
        <Icon name="upload" size={28} className="text-gold" />
        <p className="text-lg">Drop photos and clips here</p>
        <Picker onPick={onPick} />
        <p className="max-w-sm text-xs leading-relaxed text-ash">
          Each file is read, trimmed and re-encoded in this browser and kept here, through a
          refresh, while you fill in its details. Nothing is uploaded until you publish, so removing
          a wrong pick costs nothing. Clips are re-encoded to 1080p on a computer; from a phone they
          go up as shot.
        </p>
        <Link href="/admin/posts" className="text-sm text-gold hover:underline">
          Writing a journal post instead?
        </Link>
      </div>
    </div>
  );
}

function BulkBar({
  items,
  selected,
  rolls,
  options,
}: {
  items: QueueItem[];
  selected: QueueItem[];
  rolls: RollOption[];
  options: Options;
}) {
  const queue = useAddQueue();
  const [bulk, setBulk] = useState({ location: '', camera: '', tags: '', rollId: '' });
  const all = useRef<HTMLInputElement>(null);
  const hasStill = selected.some((item) => item.kind === 'still');
  const hasClip = selected.some((item) => item.kind === 'clip');
  const some = selected.length > 0 && selected.length < items.length;
  const empty = !bulk.location.trim() && !bulk.camera.trim() && !bulk.tags.trim() && !bulk.rollId;

  useEffect(() => {
    if (all.current) all.current.indeterminate = some;
  }, [some]);

  function apply() {
    queue.editMany(
      selected.map((item) => item.key),
      (item) => applyBulk(item.kind, item.fields, bulk),
    );
    setBulk({ location: '', camera: '', tags: '', rollId: '' });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-film px-4 py-3 md:px-6">
      <label className="flex items-center gap-2.5 text-sm">
        <input
          ref={all}
          type="checkbox"
          checked={selected.length === items.length}
          onChange={(event) => queue.select(items.map((item) => item.key), event.target.checked)}
          className="size-4 accent-gold"
        />
        <span>
          <strong className="font-semibold">{selected.length} selected</strong>
          {selected.length ? <span className="text-ash"> — set on all of them:</span> : null}
        </span>
      </label>
      {selected.length ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!empty) apply();
          }}
        >
          {hasStill ? (
            <>
              <div className="w-44">
                <SuggestField
                  label="Place for all selected"
                  placeholder="Place"
                  value={bulk.location}
                  onChange={(location) => setBulk({ ...bulk, location })}
                  options={options.places}
                  className={`${INPUT} ${BULK}`}
                />
              </div>
              <div className="w-44">
                <SuggestField
                  label="Camera for all selected"
                  placeholder="Camera"
                  value={bulk.camera}
                  onChange={(camera) => setBulk({ ...bulk, camera })}
                  options={options.cameras}
                  className={`${INPUT} ${BULK}`}
                />
              </div>
            </>
          ) : null}
          {hasClip && rolls.length ? (
            <div className="w-44">
              <SelectField
                label="Roll for all selected clips"
                placeholder="Roll"
                value={bulk.rollId}
                onChange={(rollId) => setBulk({ ...bulk, rollId })}
                options={rolls.map((roll) => ({ value: roll.id, label: roll.name }))}
                className={`${INPUT} ${BULK}`}
              />
            </div>
          ) : null}
          <div className="w-56">
            <TagField
              label="Tags to add to all selected"
              value={bulk.tags}
              onChange={(tags) => setBulk({ ...bulk, tags })}
              options={options.tags}
              className={`${INPUT} ${BULK}`}
            />
          </div>
          <button
            type="submit"
            disabled={empty}
            className="h-9 rounded-md border border-gold px-3.5 text-sm text-gold transition hover:bg-gold/10 disabled:opacity-40"
          >
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}

function QueueRow({
  item,
  rolls,
  options,
  reviewing,
  onReview,
}: {
  item: QueueItem;
  rolls: RollOption[];
  options: Options;
  reviewing: boolean;
  onReview: () => void;
}) {
  const queue = useAddQueue();
  const ready = item.stage === 'ready';
  const problems = ready ? problemsOf(item) : [];
  // Mid-upload a row cannot be pulled: the upload cannot be stopped, and the
  // draft it is about to write is better discarded once it exists.
  const locked = sending(item.stage) || item.saving;
  const wanted = (blank: boolean) => (ready && blank ? WANTED : QUIET);

  return (
    <div className={`flex flex-col gap-3 ${ROW}`}>
      <div className="flex items-start gap-3 lg:contents">
        <input
          type="checkbox"
          checked={item.selected}
          onChange={(event) => queue.select([item.key], event.target.checked)}
          aria-label={`Select ${item.name}`}
          className="mt-1 size-4 shrink-0 accent-gold lg:mt-2"
        />
        <Thumb item={item} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 lg:pt-1">
          <span className="truncate text-sm">{item.name}</span>
          {item.note ? <span className="font-mono text-[11px] text-ash">{item.note}</span> : null}
          {item.warning ? <span className="text-[11px] text-[#e0a050]">{item.warning}</span> : null}
          {item.kind === 'still' && ready ? (
            <button
              type="button"
              onClick={onReview}
              className={`self-start text-[11px] ${item.insets ? 'rounded bg-gold/12 px-2 py-0.5 text-gold' : 'text-ash hover:text-bone'}`}
            >
              {reviewing ? 'Close trim' : item.insets ? 'White border cut · review' : 'Trim border'}
            </button>
          ) : null}
          {/* Only before upload: an uploaded draft's frames are redone from its edit page. */}
          {item.kind === 'clip' && ready && !item.id ? (
            <button
              type="button"
              onClick={onReview}
              className="self-start rounded bg-gold/12 px-2 py-0.5 text-[11px] text-gold"
            >
              {reviewing ? 'Close preview' : item.hasCover ? 'Thumbnail picked · preview' : 'Preview frames · thumbnail'}
            </button>
          ) : null}
          {/* The status, beside the name rather than in its own column on a phone. */}
          <div className="lg:hidden">
            <Status item={item} problems={problems} locked={locked} />
          </div>
        </div>
      </div>

      {item.kind === 'still' ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            aria-label="Title"
            placeholder="Title (optional)"
            value={item.fields.title}
            onChange={(event) => queue.edit(item.key, 'still', { title: event.target.value })}
            className={`${INPUT} ${QUIET}`}
          />
          <SuggestField
            label="Place"
            placeholder="Place"
            value={item.fields.location}
            onChange={(location) => queue.edit(item.key, 'still', { location })}
            options={options.places}
            className={`${INPUT} ${wanted(!item.fields.location.trim())}`}
          />
          <input
            aria-label="Date taken"
            type="date"
            value={item.fields.takenAt}
            title={needsDate(item) && ready ? 'No date in the file — type it in, or it is unknown for good' : undefined}
            onChange={(event) => queue.edit(item.key, 'still', { takenAt: event.target.value })}
            className={`${INPUT} ${wanted(!item.fields.takenAt)} [color-scheme:dark]`}
          />
          <SuggestField
            label="Camera"
            placeholder="Camera"
            value={item.fields.camera}
            onChange={(camera) => queue.edit(item.key, 'still', { camera })}
            options={options.cameras}
            className={`${INPUT} ${wanted(!item.fields.camera.trim())}`}
          />
          <div className="sm:col-span-2">
            <TagField
              label="Tags"
              value={item.fields.tags}
              onChange={(tags) => queue.edit(item.key, 'still', { tags })}
              options={options.tags}
              className={`${INPUT} ${QUIET}`}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            aria-label="Title"
            placeholder="Title"
            value={item.fields.title}
            onChange={(event) => queue.edit(item.key, 'clip', { title: event.target.value })}
            className={`${INPUT} ${wanted(!item.fields.title.trim())}`}
          />
          {rolls.length ? (
            <SelectField
              label="Roll"
              placeholder="Pick a roll"
              value={item.fields.rollId}
              onChange={(rollId) => queue.edit(item.key, 'clip', { rollId })}
              options={rolls.map((roll) => ({ value: roll.id, label: `Roll: ${roll.name}` }))}
              className={`${INPUT} ${wanted(!item.fields.rollId)}`}
            />
          ) : (
            <Link href="/admin/videos#new-roll" className="flex h-9 items-center text-xs text-[#e0a050] underline">
              Add a roll first
            </Link>
          )}
          <input
            aria-label="YouTube link"
            type="text"
            inputMode="url"
            placeholder="YouTube link (4K, optional)"
            value={item.fields.youtubeUrl}
            onChange={(event) => queue.edit(item.key, 'clip', { youtubeUrl: event.target.value })}
            className={`${INPUT} ${problems.includes('a YouTube link that works') ? WANTED : QUIET}`}
          />
          <TagField
            label="Tags"
            value={item.fields.tags}
            onChange={(tags) => queue.edit(item.key, 'clip', { tags })}
            options={options.tags}
            className={`${INPUT} ${QUIET}`}
          />
          <input
            aria-label="Description"
            placeholder="Description (optional)"
            value={item.fields.description}
            onChange={(event) => queue.edit(item.key, 'clip', { description: event.target.value })}
            className={`${INPUT} ${QUIET} sm:col-span-2`}
          />
        </div>
      )}

      <div className="hidden lg:block lg:pt-1">
        <Status item={item} problems={problems} locked={locked} />
      </div>

      {reviewing && item.kind === 'clip' && queue.clipSource(item.key) ? (
        <div className="lg:col-span-5 lg:col-start-1">
          <ClipPreview
            item={item}
            source={queue.clipSource(item.key)!}
            onRegrab={(start) => queue.regrab(item.key, start)}
            onCover={(picked) => queue.setCover(item.key, picked)}
          />
        </div>
      ) : null}

      {reviewing && item.kind === 'still' ? (
        <div className="lg:col-span-5 lg:col-start-1">
          {item.id ? (
            // Already uploaded by a publish that did not finish: the stored
            // copy is all there is, so this trims and replaces it in R2.
            <BorderTrimmer
              id={item.id}
              imageUrl={item.imageUrl}
              onApplied={(image) => {
                queue.retouched(item.key, image);
                onReview();
              }}
            />
          ) : queue.original(item.key) ? (
            <LocalTrimmer
              original={queue.original(item.key)!}
              insets={item.insets}
              onApply={async (insets) => {
                const problem = await queue.retrim(item.key, insets);
                if (!problem) onReview();
                return problem;
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const STAGE_LABEL: Record<MediaKind, Partial<Record<QueueItem['stage'], string>>> = {
  still: { queued: 'Queued', reading: 'Reading EXIF…', uploading: 'Uploading', saving: 'Saving…' },
  clip: {
    queued: 'Queued',
    reading: 'Sizing up…',
    encoding: 'Re-encoding 1080p',
    framing: 'Grabbing frames',
    uploading: 'Uploading',
    saving: 'Saving…',
  },
};

function Status({ item, problems, locked }: { item: QueueItem; problems: string[]; locked: boolean }) {
  const queue = useAddQueue();
  const remove = (
    <button
      type="button"
      onClick={() => void queue.remove(item.key)}
      disabled={locked}
      title={locked ? 'Finishing the upload…' : undefined}
      className="text-[11px] text-ash underline-offset-2 hover:text-bone hover:underline disabled:opacity-40"
    >
      {item.stage === 'encoding' ? 'Cancel' : item.id ? 'Discard' : 'Remove'}
    </button>
  );

  if (item.stage === 'failed') {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <span className="text-red-400">{item.error}</span>
        <span className="flex gap-3">
          <button type="button" onClick={() => queue.retry(item.key)} className="text-[11px] text-gold hover:underline">
            Retry
          </button>
          {remove}
        </span>
      </div>
    );
  }

  if (item.stage !== 'ready') {
    const showsBar = item.stage === 'uploading' || item.stage === 'encoding' || item.stage === 'framing';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-[#d0d0d4]">
          {STAGE_LABEL[item.kind][item.stage]}
          {showsBar ? ` · ${item.progress}%` : ''}
        </span>
        {showsBar ? (
          <div
            className="h-1 rounded-full bg-[#2a2a30]"
            role="progressbar"
            aria-valuenow={item.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${item.name} progress`}
          >
            <div
              className={`h-1 rounded-full transition-[width] duration-300 ${item.stage === 'encoding' ? 'bg-[#8fb3e0]' : 'bg-gold'}`}
              style={{ width: `${item.progress}%` }}
            />
          </div>
        ) : null}
        <span>{remove}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {problems.length ? (
        <span className="text-[#e0a050]">Needs {listPhrase(problems)}</span>
      ) : (
        <span className="flex items-center gap-1.5 text-[#7fc49a]">
          <Icon name="check" size={14} />
          Ready{needsDate(item) ? <span className="text-[#e0a050]"> · no date</span> : null}
        </span>
      )}
      {item.error ? <span className="text-red-400">{item.error}</span> : null}
      <span className="text-[11px] text-ash">
        {item.id ? 'Uploaded, not live yet' : 'In this browser — not uploaded'}
      </span>
      <span className="flex items-center gap-3">
        {item.saving ? <span className="text-[11px] text-ash">Saving…</span> : null}
        {remove}
      </span>
    </div>
  );
}

function Thumb({ item }: { item: QueueItem }) {
  const portrait = item.height > item.width;
  const box = portrait ? 'h-[84px] w-14' : 'h-[63px] w-28';
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-[3px] bg-frame ${box}`}>
      {item.thumb ? (
        item.thumb.startsWith('blob:') ? (
          // A local preview: next/image cannot fetch a blob URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumb} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          <Image src={item.thumb} alt="" fill sizes="112px" draggable={false} className="object-cover" />
        )
      ) : (
        <span className="absolute inset-0 animate-pulse bg-white/4 motion-reduce:animate-none" />
      )}
      {item.kind === 'clip' && item.durationSeconds ? (
        <span className="absolute right-1 bottom-1 rounded-sm bg-black/70 px-1 font-mono text-[10px]">
          {formatDuration(item.durationSeconds)}
        </span>
      ) : null}
    </span>
  );
}

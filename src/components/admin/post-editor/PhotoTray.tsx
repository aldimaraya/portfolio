'use client';

import { useMemo, useRef, useState } from 'react';
import { deleteJournalPhotos, placeJournalPhotos, tagJournalPhotos, type JournalPhotoRow } from '@/app/admin/posts/actions';
import type { PhotoRef } from '@/lib/post/content';
import type { ResolvedImage } from '@/lib/post/media';
import {
  autoLayout,
  categoryLabel,
  formatDayKey,
  groupByCategory,
  groupByDay,
  groupByPlace,
  isPostCategory,
  POST_CATEGORIES,
  type TrayPhoto,
} from '@/lib/post/trip';
import { useLibrary } from './fields';
import { batchFraction, useTripUploads, type UploadStage } from './useTripUploads';

type Tab = 'trip' | 'wall';
type Grouping = 'day' | 'category' | 'place';
type Filter = 'all' | 'untagged' | (typeof POST_CATEGORIES)[number]['id'];

const STAGE_LABEL: Record<UploadStage, string> = {
  preparing: 'Preparing',
  uploading: 'Uploading',
  saving: 'Adding',
};

interface Props {
  /** Shown as a drawer below 80rem; from there up it is a column and always open. */
  open: boolean;
  postId: string;
  photos: TrayPhoto[];
  /** Journal photo ids some block already uses, marked "In post". */
  used: Set<string>;
  /** The photos block being filled, when the tray was opened from one. */
  targetLabel: string | null;
  onClearTarget: () => void;
  onUploaded: (photo: JournalPhotoRow) => void;
  /** A stored photo that a skipped duplicate's original gave a date or place. */
  onFilled: (photo: JournalPhotoRow) => void;
  onTagged: (ids: string[], category: string | null) => void;
  onPlaced: (ids: string[], place: string | null) => void;
  onDeleted: (ids: string[]) => void;
  /** Puts photos into the post; stills come with what is needed to draw them. */
  onAdd: (refs: PhotoRef[], stills?: Record<string, ResolvedImage>) => void;
  onLayoutDays: () => void;
  onClose: () => void;
}

/**
 * The post's trip photos — everything uploaded into it, used or not — and the
 * stills wall, to pick from. Uploads land here, never on the wall: the wall is
 * curated in its own admin, and nothing in this tray reaches it.
 */
export function PhotoTray(props: Props) {
  const [tab, setTab] = useState<Tab>('trip');

  return (
    <aside className="editor-tray" aria-label="Photos" data-open={props.open || undefined}>
      <div className="editor-tray-head">
        <div role="tablist" aria-label="Photo source" className="editor-segmented">
          {(
            [
              ['trip', `Trip photos · ${props.photos.length}`],
              ['wall', 'From the wall'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="editor-icon-button editor-tray-close" aria-label="Close photos" onClick={props.onClose}>
          ×
        </button>
      </div>

      {props.targetLabel ? (
        <div className="editor-tray-target">
          <span>{props.targetLabel}</span>
          <button type="button" onClick={props.onClearTarget}>
            Add as a new block instead
          </button>
        </div>
      ) : null}

      {tab === 'trip' ? <TripTab {...props} /> : <WallTab onAdd={props.onAdd} adding={props.targetLabel !== null} />}
    </aside>
  );
}

function TripTab({
  postId,
  photos,
  used,
  onUploaded,
  onFilled,
  onTagged,
  onPlaced,
  onDeleted,
  onAdd,
  onLayoutDays,
  targetLabel,
}: Props) {
  const [grouping, setGrouping] = useState<Grouping>('day');
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [placeDraft, setPlaceDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const uploads = useTripUploads(postId, onUploaded, onFilled);
  const knownPlaces = useMemo(() => groupByPlace(photos).flatMap((group) => (group.place ? [group.place] : [])), [photos]);

  const visible = useMemo(
    () =>
      photos.filter((photo) =>
        filter === 'all' ? true : filter === 'untagged' ? !isPostCategory(photo.category) : photo.category === filter,
      ),
    [photos, filter],
  );

  const groups = useMemo(() => {
    if (grouping === 'place') {
      return groupByPlace(visible).map((group) => ({
        key: group.place ?? 'unplaced',
        title: group.place ?? 'No place',
        sub: group.place
          ? `${group.photos.length} ${group.photos.length === 1 ? 'photo' : 'photos'}`
          : `${group.photos.length} without a location — select and set a place`,
        photos: group.photos,
      }));
    }
    if (grouping === 'category') {
      return groupByCategory(visible).map((group) => ({
        key: group.id ?? 'untagged',
        title: group.label,
        sub: `${group.photos.length} ${group.photos.length === 1 ? 'photo' : 'photos'}`,
        photos: group.photos,
      }));
    }
    // Numbered against every photo, not just the filtered ones, so "Day 3"
    // means the same day whatever the filter.
    const numbers = new Map(groupByDay(photos).map((day) => [day.key, day.number]));
    return groupByDay(visible).map((day) => ({
      key: day.key ?? 'undated',
      title: day.key ? `Day ${numbers.get(day.key)}` : 'No date',
      sub: day.key ? `${formatDayKey(day.key)} · ${day.photos.length}` : `${day.photos.length} without a capture date`,
      photos: day.photos,
    }));
  }, [grouping, photos, visible]);

  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const photo of photos) {
      const key = isPostCategory(photo.category) ? photo.category : 'untagged';
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    }
    return byCategory;
  }, [photos]);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  }

  async function tag(category: string | null) {
    const ids = picked;
    setError('');
    onTagged(ids, category);
    const result = await tagJournalPhotos({ postId, ids, category });
    if (result.error) setError(result.error);
  }

  async function setPlace(place: string | null) {
    const ids = picked;
    setError('');
    const result = await placeJournalPhotos({ postId, ids, place });
    if (result.error) {
      setError(result.error);
      return;
    }
    // The server's tidied name, so the tray groups by exactly what was stored.
    onPlaced(ids, result.place ?? null);
    setPlaceDraft('');
  }

  async function remove() {
    const ids = picked;
    setError('');
    const result = await deleteJournalPhotos({ postId, ids });
    setConfirmingDelete(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPicked([]);
    onDeleted(ids);
  }

  function add() {
    // In the order they were picked, which is the order they will sit in.
    onAdd(picked.map((id) => ({ kind: 'journal', id })));
    setPicked([]);
  }

  const { progress } = uploads;

  return (
    <div
      className="editor-tray-body"
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        uploads.add([...event.dataTransfer.files]);
      }}
    >
      <div className="editor-tray-section">
        <p className="editor-muted">
          Drop a whole trip here. These photos stay in this post and never appear on the stills wall.
        </p>
        <div className="editor-tray-actions">
          <button type="button" className="editor-button" onClick={() => input.current?.click()}>
            Upload photos
          </button>
          <button type="button" className="editor-button editor-button--gold" disabled={!photos.length} onClick={onLayoutDays}>
            Lay out days not in the post yet
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            uploads.add([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />

        {progress.total ? (
          <div className="editor-upload-status" role="status">
            <div
              className="editor-upload-bar"
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(batchFraction(progress) * 100)}
              data-failed={(!progress.current && progress.failed.length > 0) || undefined}
            >
              <span style={{ width: `${batchFraction(progress) * 100}%` }} />
            </div>
            {progress.current ? (
              <span>
                {Math.min(progress.done + 1, progress.total)} of {progress.total} · {STAGE_LABEL[progress.current.stage]}{' '}
                {progress.current.name}
                {progress.current.stage === 'uploading' ? ` · ${progress.current.percent}%` : '…'}
                {progress.failed.length ? <span className="editor-error"> · {progress.failed.length} failed</span> : null}
              </span>
            ) : (
              <span>
                Uploaded {progress.done - progress.failed.length - progress.skipped.length} of {progress.total}
                {progress.failed.length ? (
                  <button type="button" onClick={uploads.retry}>
                    Retry {progress.failed.length} failed
                  </button>
                ) : null}
                <button type="button" onClick={uploads.dismiss}>
                  Dismiss
                </button>
              </span>
            )}
            {progress.failed.map((failure, index) => (
              <span key={`${failure.name}-${index}`} className="editor-error">
                {failure.name}: {failure.reason}
              </span>
            ))}
            {progress.skipped.length ? (
              <span>
                Already in this post, so skipped:{' '}
                {progress.skipped
                  .map(({ name, filled }) => (filled.length ? `${name} (added its ${filled.join(' and ')})` : name))
                  .join(', ')}
                {progress.current ? null : (
                  <button type="button" onClick={uploads.uploadSkipped}>
                    Upload {progress.skipped.length === 1 ? 'it' : 'them'} anyway
                  </button>
                )}
              </span>
            ) : null}
          </div>
        ) : null}

        {photos.length ? (
          <div className="editor-tray-controls">
            <div role="group" aria-label="Group by" className="editor-segmented editor-segmented--small">
              {(
                [
                  ['day', 'By day'],
                  ['category', 'By category'],
                  ['place', 'By place'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={grouping === id} onClick={() => setGrouping(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Show" className="editor-chips">
              {(
                [
                  ['all', 'All', photos.length],
                  ...POST_CATEGORIES.map((category) => [category.id, category.label, counts.get(category.id) ?? 0] as const),
                  ['untagged', 'Untagged', counts.get('untagged') ?? 0],
                ] as const
              ).map(([id, label, count]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id as Filter)}>
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="editor-tray-groups">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="editor-tray-group-head">
              <h3>{group.title}</h3>
              <span>{group.sub}</span>
              <button
                type="button"
                onClick={() => setPicked((current) => [...current, ...group.photos.map((photo) => photo.id).filter((id) => !current.includes(id))])}
              >
                Select all
              </button>
            </div>
            <div className="editor-thumbs">
              {group.photos.map((photo) => {
                const order = picked.indexOf(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className="editor-thumb"
                    aria-pressed={order >= 0}
                    title={photo.place ?? undefined}
                    aria-label={`${categoryLabel(photo.category)} photo${photo.place ? ` in ${photo.place}` : ''}${order >= 0 ? ', selected' : ''}${used.has(photo.id) ? ', in the post' : ''}`}
                    onClick={() => toggle(photo.id)}
                  >
                    {/* Plain <img>: an admin-only grid is not worth spending the
                        image optimiser's quota on. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.imageUrl} alt="" loading="lazy" decoding="async" />
                    <span className="editor-thumb-tag" data-untagged={!isPostCategory(photo.category) || undefined}>
                      {categoryLabel(photo.category)}
                    </span>
                    {order >= 0 ? <span className="editor-thumb-order">{order + 1}</span> : null}
                    {used.has(photo.id) ? <span className="editor-thumb-used">In post</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {photos.length && !groups.length ? <p className="editor-muted">Nothing in this category yet.</p> : null}
        {/* Nominatim's terms ask for this wherever its names are shown. */}
        {knownPlaces.length ? (
          <p className="editor-muted editor-attribution">
            Place names from{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              © OpenStreetMap contributors
            </a>
          </p>
        ) : null}
      </div>

      {error ? <p className="editor-error editor-tray-section">{error}</p> : null}

      {picked.length ? (
        <div className="editor-tray-foot">
          <div className="editor-tray-foot-row">
            <strong>
              {picked.length} {picked.length === 1 ? 'photo' : 'photos'} selected
            </strong>
            <button type="button" onClick={() => setPicked([])}>
              Clear
            </button>
          </div>
          <div className="editor-chips">
            <span className="editor-chips-label">Tag as</span>
            {POST_CATEGORIES.map((category) => (
              <button key={category.id} type="button" onClick={() => tag(category.id)}>
                {category.label}
              </button>
            ))}
            <button type="button" onClick={() => tag(null)}>
              Untag
            </button>
          </div>
          <form
            className="editor-place-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (placeDraft.trim()) void setPlace(placeDraft);
            }}
          >
            <span className="editor-chips-label">Place</span>
            <input
              type="text"
              value={placeDraft}
              onChange={(event) => setPlaceDraft(event.target.value)}
              placeholder={knownPlaces[0] ? `e.g. ${knownPlaces[0]}` : 'e.g. Kyoto'}
              list="editor-known-places"
              maxLength={80}
              aria-label="Place for the selected photos"
            />
            <datalist id="editor-known-places">
              {knownPlaces.map((place) => (
                <option key={place} value={place} />
              ))}
            </datalist>
            <button type="submit" disabled={!placeDraft.trim()}>
              Set
            </button>
            <button type="button" onClick={() => setPlace(null)}>
              Clear
            </button>
          </form>
          <button type="button" className="editor-primary" onClick={add}>
            {targetLabel
              ? `Add ${picked.length} to the block`
              : `Add ${picked.length} to the post as ${({ stacked: 'one photo', row: 'a row', grid: 'a grid', carousel: 'a carousel' } as const)[autoLayout(picked.length)]}`}
          </button>
          {confirmingDelete ? (
            <div className="editor-tray-foot-row">
              <span className="editor-error">Delete {picked.length} for good? Blocks using them lose them.</span>
              <button type="button" className="editor-danger" onClick={remove}>
                Delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="editor-link-button editor-danger" onClick={() => setConfirmingDelete(true)}>
              Delete selected…
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function WallTab({
  onAdd,
  adding,
}: {
  onAdd: (refs: PhotoRef[], stills?: Record<string, ResolvedImage>) => void;
  adding: boolean;
}) {
  const library = useLibrary(true);
  const [picked, setPicked] = useState<string[]>([]);

  if (!library) return <p className="editor-muted editor-tray-section">Loading the wall…</p>;
  if (!library.photos.length) return <p className="editor-muted editor-tray-section">The wall is empty.</p>;

  function add() {
    if (!library) return;
    const byId = new Map(library.photos.map((photo) => [photo.id, photo]));
    const stills: Record<string, ResolvedImage> = {};
    for (const id of picked) {
      const photo = byId.get(id);
      if (photo) stills[id] = { url: photo.imageUrl, width: photo.width, height: photo.height, alt: photo.title || photo.location };
    }
    onAdd(
      picked.map((id) => ({ kind: 'still', id })),
      stills,
    );
    setPicked([]);
  }

  return (
    <div className="editor-tray-body">
      <p className="editor-muted editor-tray-section">
        Photos already on the stills wall, reused rather than uploaded twice. They stay on the wall too.
      </p>
      <div className="editor-tray-groups">
        <div className="editor-thumbs">
          {library.photos.map((photo) => {
            const order = picked.indexOf(photo.id);
            return (
              <button
                key={photo.id}
                type="button"
                className="editor-thumb"
                aria-pressed={order >= 0}
                title={photo.title || photo.location}
                aria-label={photo.title || photo.location}
                onClick={() =>
                  setPicked((current) => (current.includes(photo.id) ? current.filter((id) => id !== photo.id) : [...current, photo.id]))
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.imageUrl} alt="" loading="lazy" decoding="async" />
                {order >= 0 ? <span className="editor-thumb-order">{order + 1}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {picked.length ? (
        <div className="editor-tray-foot">
          <button type="button" className="editor-primary" onClick={add}>
            Add {picked.length} to the {adding ? 'block' : 'post'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

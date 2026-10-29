'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { deletePhoto, savePhotoDetails, type PhotoDetailsInput } from '@/app/admin/photos/actions';
import { warmthPosition } from '@/lib/admin/stills';
import { placeholderColor } from '@/lib/color/analyze';
import { takenAtToInputValue } from '@/lib/photo/date';
import { OPEN_PHOTO_PARAM } from '@/lib/photo/lightbox-link';
import { summarizeSettings, type PhotoSettings } from '@/lib/photo/settings';
import { formatTagNames, parseTagNames } from '@/lib/tags/parse';
import { BorderTrimmer } from '../BorderTrimmer';
import { DeleteButton } from '../DeleteButton';
import { FIELD, LABEL } from '../fields';
import { Icon } from '../shell/Icon';
import type { Still } from './StillsLibrary';

type Draft = Omit<PhotoDetailsInput, 'id'>;
type Status = { kind: 'saved' | 'pending' | 'saving' } | { kind: 'error'; message: string };

/** Long enough to cover a word being typed, short enough that leaving feels safe. */
const AUTOSAVE_MS = 700;

const SETTING_FIELDS: { key: Exclude<keyof PhotoSettings, 'lens'>; label: string; placeholder: string }[] = [
  { key: 'focalLength', label: 'Focal length', placeholder: '35mm' },
  { key: 'aperture', label: 'Aperture', placeholder: 'f/1.4' },
  { key: 'shutter', label: 'Shutter', placeholder: '1/250' },
  { key: 'iso', label: 'ISO', placeholder: '400' },
];

const PILL = 'rounded border px-2 py-0.5 text-xs transition';
const PILL_ON = `${PILL} border-gold bg-gold/10 text-gold`;
const PILL_OFF = `${PILL} border-white/15 hover:border-white/40`;

function draftOf(photo: Still): Draft {
  return {
    title: photo.title,
    location: photo.location,
    camera: photo.camera,
    settings: photo.settings,
    takenAt: photo.takenAt ? takenAtToInputValue(photo.takenAt) : '',
    tags: formatTagNames(photo.tags),
  };
}

/**
 * Edits the selected photo in place. There is no Save button: each change is
 * written shortly after typing stops, and whatever is still pending is written
 * when the inspector moves to another photo. Mounted per photo (keyed by id),
 * so a draft can never leak from one photo onto the next.
 *
 * Everything about a stored photo is edited here — there is no separate edit
 * page. Camera and exposure are set from EXIF at upload and rarely touched, so
 * they show as a summary until Edit opens their six fields; the border trim
 * loads the full-size original, so it only runs once asked for.
 */
export function StillInspector({
  width,
  photo,
  library,
  wallIndex,
  position,
  returnTo,
  tagOptions,
  locationOptions,
  onStep,
  onClose,
}: {
  /** The column's width from lg up, for the preview's image request. */
  width: number;
  photo: Still;
  library: Still[];
  wallIndex: number;
  position: { index: number; total: number } | null;
  /** The wall the photo was opened from, when it was — see editPhotoHref. */
  returnTo: string | null;
  tagOptions: string[];
  locationOptions: string[];
  onStep: (delta: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(photo));
  const [status, setStatus] = useState<Status>({ kind: 'saved' });
  // The latest unsaved edit, readable from the unmount cleanup below.
  const pending = useRef<PhotoDetailsInput | null>(null);
  const [editingCamera, setEditingCamera] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const ids = useId();

  function edit(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    pending.current = { id: photo.id, ...next };
    setStatus({ kind: 'pending' });
  }

  async function flush() {
    const input = pending.current;
    if (!input) return;
    pending.current = null;
    setStatus({ kind: 'saving' });
    // Server actions run one at a time per client, so an earlier save can never
    // land after a later one.
    const result = await savePhotoDetails(input);
    // A newer edit arrived mid-save; its own timer reports on it.
    if (pending.current) return;
    setStatus(result.error ? { kind: 'error', message: result.error } : { kind: 'saved' });
  }

  useEffect(() => {
    if (status.kind !== 'pending') return;
    const timer = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // Re-arming on each draft change is the debounce; flush reads only the ref.
  }, [draft, status.kind]);

  // Stepping to another photo unmounts this one: write what is left rather than
  // dropping it. Fire-and-forget — there is no inspector left to report on it.
  useEffect(
    () => () => {
      if (pending.current) void savePhotoDetails(pending.current);
    },
    [],
  );

  const settings = summarizeSettings(draft.settings);
  const warmth = warmthPosition(photo, library);
  const setSetting = (key: keyof PhotoSettings, value: string) => edit({ settings: { ...draft.settings, [key]: value } });

  return (
    <aside
      aria-label="Selected photo"
      // A full-screen sheet on a phone (over the tab bar), a column from lg up.
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-film lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-(--inspector-w) lg:shrink-0 lg:border-l lg:border-hairline"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-film px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5">
        <button type="button" onClick={onClose} className="h-11 pr-2 text-gold lg:hidden">
          ‹ Stills
        </button>
        <button type="button" aria-label="Previous photo" onClick={() => onStep(-1)} disabled={position?.index === 0} className="size-8 rounded-md border border-white/12 disabled:opacity-40">
          ‹
        </button>
        <button
          type="button"
          aria-label="Next photo"
          onClick={() => onStep(1)}
          disabled={position !== null && position.index === position.total - 1}
          className="size-8 rounded-md border border-white/12 disabled:opacity-40"
        >
          ›
        </button>
        {position ? (
          <span className="font-mono text-[11px] text-ash">
            {position.index + 1} of {position.total}
          </span>
        ) : null}
        <SaveStatus status={status} />
      </div>

      <div className="flex flex-col gap-4 p-4 lg:p-[18px]">
        <div
          className="relative w-full overflow-hidden rounded"
          style={{ aspectRatio: `${photo.width} / ${photo.height}`, maxHeight: '50vh', backgroundColor: placeholderColor(photo) }}
        >
          <Image src={photo.imageUrl} alt="" fill sizes={`(min-width: 1024px) ${width}px, 100vw`} className="object-contain" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-title`} className={LABEL}>
            Title
          </label>
          <input
            id={`${ids}-title`}
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
            placeholder="Optional — shown instead of the place"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-place`} className={LABEL}>
            Place
          </label>
          <input
            id={`${ids}-place`}
            value={draft.location}
            onChange={(event) => edit({ location: event.target.value })}
            placeholder="e.g. Tokyo / Shinjuku"
            className={`${FIELD} ${draft.location.trim() ? '' : 'border-amber-400/70'}`}
          />
          <PlacePills value={draft.location} options={locationOptions} onPick={(location) => edit({ location })} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-taken`} className={LABEL}>
            Taken
          </label>
          {/* EXIF is stripped before upload, so a photo missing its date only
              ever gets one by hand — hence the amber until it does. */}
          <input
            id={`${ids}-taken`}
            type="date"
            value={draft.takenAt}
            onChange={(event) => edit({ takenAt: event.target.value })}
            className={`${FIELD} ${draft.takenAt ? '' : 'border-amber-400/70'}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Camera · lens · exposure</span>
          <div className="flex flex-col gap-2.5 rounded border border-hairline bg-frame px-3 py-2.5">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={draft.camera.trim() ? '' : 'text-amber-400'}>{draft.camera.trim() || 'No camera'}</span>
                {settings ? <span className="font-mono text-xs text-[#b4b4ba]">{settings}</span> : null}
              </div>
              <button
                type="button"
                aria-expanded={editingCamera}
                onClick={() => setEditingCamera((open) => !open)}
                className="shrink-0 rounded border border-white/15 px-2 py-0.5 text-xs text-ash transition hover:border-white/40 hover:text-bone"
              >
                {editingCamera ? 'Done' : 'Edit'}
              </button>
            </div>
            {editingCamera ? (
              <div className="grid grid-cols-2 gap-2 border-t border-hairline pt-2.5">
                <input
                  aria-label="Camera"
                  placeholder="Camera (e.g. Sony A7 IV)"
                  value={draft.camera}
                  onChange={(event) => edit({ camera: event.target.value })}
                  className={`${FIELD} col-span-2 bg-film`}
                />
                <input
                  aria-label="Lens"
                  placeholder="Lens (e.g. Sigma 35mm F1.4)"
                  value={draft.settings.lens}
                  onChange={(event) => setSetting('lens', event.target.value)}
                  className={`${FIELD} col-span-2 bg-film`}
                />
                {SETTING_FIELDS.map(({ key, label, placeholder }) => (
                  <input
                    key={key}
                    aria-label={label}
                    placeholder={`${label} (${placeholder})`}
                    value={draft.settings[key]}
                    onChange={(event) => setSetting(key, event.target.value)}
                    className={`${FIELD} min-w-0 bg-film`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <InspectorTags value={draft.tags} onChange={(tags) => edit({ tags })} suggestions={tagOptions} />

        {trimming ? (
          <div className="flex flex-col gap-2">
            <BorderTrimmer id={photo.id} imageUrl={photo.imageUrl} />
            <button type="button" onClick={() => setTrimming(false)} className="self-start text-xs text-ash hover:text-bone">
              Close trim
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className={LABEL}>Where it sits on the wall</span>
          {warmth === null ? (
            <p className="text-sm text-ash">In the monochrome band, ordered dark to light ahead of the colour.</p>
          ) : (
            <>
              <div className="relative h-2.5 rounded-full bg-[linear-gradient(90deg,#3f6fa8,#7d8a80,#c08a4a)]">
                <span
                  className="absolute top-1/2 size-4 -translate-1/2 rounded-full border-2 border-bone bg-ink"
                  style={{ left: `${warmth * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-ash">
                <span>cool</span>
                <span>
                  {wallIndex + 1} of {library.length}
                </span>
                <span>warm</span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-hairline pt-4 text-sm">
          {trimming ? null : (
            <button
              type="button"
              onClick={() => setTrimming(true)}
              className="rounded border border-hairline px-3 py-2 transition hover:border-white/40"
            >
              Trim white border…
            </button>
          )}
          <Link
            href={returnTo ?? `/stills?${OPEN_PHOTO_PARAM}=${encodeURIComponent(photo.id)}`}
            className="rounded border border-hairline px-3 py-2 transition hover:border-white/40"
          >
            {returnTo ? '‹ Back to the wall' : 'Open on wall ↗'}
          </Link>
        </div>
        <DeleteButton id={photo.id} action={deletePhoto} redirectTo="/admin/photos" label="Delete photo" />
      </div>
    </aside>
  );
}

function SaveStatus({ status }: { status: Status }) {
  if (status.kind === 'error') {
    return (
      <span role="alert" className="ml-auto truncate text-xs text-red-400" title={status.message}>
        {status.message}
      </span>
    );
  }
  if (status.kind === 'saved') {
    return (
      <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-300">
        <Icon name="check" size={14} />
        Saved
      </span>
    );
  }
  return <span className="ml-auto text-xs text-ash">{status.kind === 'saving' ? 'Saving…' : 'Edited'}</span>;
}

/**
 * Tags as chips in one field, with every other tag in the library as one-click
 * pills underneath for quick tagging. Typing narrows the pills; the list is
 * height-capped so a big tag library scrolls instead of pushing the rest of the
 * inspector off a narrow column.
 */
function InspectorTags({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const [typed, setTyped] = useState('');
  const selected = parseTagNames(value);
  const emit = (names: string[]) => onChange(formatTagNames(parseTagNames(names.join(','))));
  const query = typed.trim().toLowerCase();
  const matches = suggestions.filter((name) => !selected.includes(name) && (!query || name.includes(query)));

  function commit() {
    const names = parseTagNames(typed);
    if (names.length) emit([...selected, ...names]);
    setTyped('');
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL}>Tags</span>
      <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded border border-hairline bg-frame p-1.5 focus-within:border-gold">
        {selected.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => emit(selected.filter((other) => other !== name))}
            aria-label={`Remove ${name}`}
            className="flex h-6 items-center gap-1 rounded bg-[#2a2a30] px-2 text-xs hover:bg-[#34343b]"
          >
            {name} <span aria-hidden="true" className="text-ash">×</span>
          </button>
        ))}
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Backspace' && typed === '' && selected.length) {
              emit(selected.slice(0, -1));
            }
          }}
          onBlur={commit}
          aria-label="Add a tag"
          placeholder={selected.length ? 'add…' : 'Add a tag'}
          className="h-6 min-w-16 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-ash"
        />
      </div>
      {matches.length ? (
        <ul className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {matches.map((name) => (
            <li key={name}>
              <button
                type="button"
                // mousedown, so the input's blur does not commit the half-typed text first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  emit([...selected, name]);
                  setTyped('');
                }}
                className={PILL_OFF}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Every place already in the library, one click to use. A single value, so a
 * pill replaces what is typed rather than adding to it, and the selected one
 * stays lit. Typing narrows the list; it never narrows to nothing on an exact
 * match, so the alternatives stay one click away.
 */
function PlacePills({ value, options, onPick }: { value: string; options: string[]; onPick: (value: string) => void }) {
  const query = value.trim().toLowerCase();
  const exact = options.some((name) => name.toLowerCase() === query);
  const shown = exact || !query ? options : options.filter((name) => name.toLowerCase().includes(query));
  if (!shown.length) return null;
  return (
    <ul className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
      {shown.map((name) => (
        <li key={name}>
          <button type="button" onClick={() => onPick(name)} className={name === value ? PILL_ON : PILL_OFF}>
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}

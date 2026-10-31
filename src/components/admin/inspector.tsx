'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { formatTagNames, parseTagNames } from '@/lib/tags/parse';
import { LABEL } from './fields';
import { Icon } from './shell/Icon';

/**
 * What the Stills and Motion inspectors share: the autosave, the status that
 * reports on it, and the tag field. Each inspector is mounted per item (keyed by
 * id), which is what lets the autosave flush on unmount without ever writing one
 * item's draft onto the next.
 */

export type SaveState = { kind: 'saved' | 'pending' | 'saving' } | { kind: 'error'; message: string };

/** Long enough to cover a word being typed, short enough that leaving feels safe. */
const AUTOSAVE_MS = 700;

export const STEP =
  'size-8 rounded-md border border-white/12 transition-colors hover:border-white/40 active:bg-white/8 disabled:pointer-events-none disabled:opacity-40';

/** Something revealed in place — a remounted preview, an opened section — eases in instead of popping. */
export const REVEAL = 'motion-safe:animate-[fade-in_220ms_ease-out]';

const PILL = 'rounded border px-2 py-0.5 text-xs transition';
export const PILL_ON = `${PILL} border-gold bg-gold/10 text-gold`;
export const PILL_OFF = `${PILL} border-white/15 hover:border-white/40`;

/**
 * Writes the latest queued input shortly after edits stop, and whatever is
 * still pending when the inspector unmounts. There is no Save button anywhere
 * this is used.
 */
export function useAutosave<T>(
  /** A server action, so the same function on every render. */
  save: (input: T) => Promise<{ error?: string }>,
) {
  const [status, setStatus] = useState<SaveState>({ kind: 'saved' });
  // The latest unsaved edit, readable from the unmount cleanup below.
  const pending = useRef<T | null>(null);
  // Bumped per edit, so the timer re-arms on each one — that is the debounce.
  const [edits, setEdits] = useState(0);

  function queue(input: T) {
    pending.current = input;
    setStatus({ kind: 'pending' });
    setEdits((count) => count + 1);
  }

  async function flush() {
    const input = pending.current;
    if (input === null) return;
    pending.current = null;
    setStatus({ kind: 'saving' });
    // Server actions run one at a time per client, so an earlier save can never
    // land after a later one.
    const result = await save(input);
    // A newer edit arrived mid-save; its own timer reports on it.
    if (pending.current !== null) return;
    setStatus(result.error ? { kind: 'error', message: result.error } : { kind: 'saved' });
  }

  // Re-arming per edit is the debounce.
  const onIdle = useEffectEvent(flush);
  useEffect(() => {
    if (!edits) return;
    const timer = setTimeout(onIdle, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [edits]);

  // Stepping to another item unmounts this one: write what is left rather than
  // dropping it. Fire-and-forget — there is no inspector left to report on it.
  useEffect(
    () => () => {
      if (pending.current !== null) void save(pending.current);
    },
    [save],
  );

  return { status, queue };
}

export function SaveStatus({ status }: { status: SaveState }) {
  if (status.kind === 'error') {
    return (
      <span role="alert" className={`ml-auto truncate text-xs text-red-400 ${REVEAL}`} title={status.message}>
        {status.message}
      </span>
    );
  }
  if (status.kind === 'saved') {
    return (
      <span key="saved" className={`ml-auto flex items-center gap-1.5 text-xs text-emerald-300 ${REVEAL}`}>
        <Icon name="check" size={14} />
        Saved
      </span>
    );
  }
  return <span key="busy" className="ml-auto text-xs text-ash">{status.kind === 'saving' ? 'Saving…' : 'Edited'}</span>;
}

/**
 * Tags as chips in one field, with every other tag in the library as one-click
 * pills underneath for quick tagging. Typing narrows the pills; the list is
 * height-capped so a big tag library scrolls instead of pushing the rest of the
 * inspector off a narrow column.
 */
export function InspectorTags({
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

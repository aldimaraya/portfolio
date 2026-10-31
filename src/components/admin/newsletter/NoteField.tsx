'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { saveMessage } from '@/app/admin/newsletter/actions';
import { MESSAGE_MAX } from '@/lib/newsletter/layout';

const SAVE_AFTER_MS = 800;

type Status = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The note at the top of the next email. Saves itself a moment after typing
 * stops, like the Stills inspector, and refreshes the preview only on leaving
 * the field — reloading the email under every pause would make it flicker.
 */
export function NoteField({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  // The text last handed to saveMessage, and the text waiting on the timer.
  // Refs, because blur and unmount must see them as they are now, not as the
  // render that made the handler saw them.
  const sent = useRef(initial);
  const pending = useRef<string | null>(null);

  // A send clears the note on the server; take that in unless there are edits
  // here not yet saved, which win.
  const [syncedTo, setSyncedTo] = useState(initial);
  if (initial !== syncedTo) {
    setSyncedTo(initial);
    if (value === saved) {
      setValue(initial);
      setSaved(initial);
    }
  }
  // Follows what the server confirmed, which includes a send clearing it —
  // otherwise retyping the note a send took would match `sent` and never save.
  // A confirmation landing behind a newer save only costs that save a repeat.
  useEffect(() => {
    sent.current = saved;
  }, [saved]);

  async function flush(text: string): Promise<boolean> {
    clearTimeout(timer.current);
    pending.current = null;
    if (text.trim() === sent.current.trim()) return false;
    const previous = sent.current;
    sent.current = text;
    setStatus('saving');
    const result = await saveMessage(text);
    if (result.error) {
      if (sent.current === text) sent.current = previous;
      setStatus('error');
      setError(result.error);
      return false;
    }
    setSaved(text);
    setStatus('saved');
    setError('');
    return true;
  }

  function change(text: string) {
    setValue(text);
    setStatus('idle');
    clearTimeout(timer.current);
    pending.current = text;
    timer.current = setTimeout(() => {
      inFlight.current = flush(text);
    }, SAVE_AFTER_MS);
  }

  async function blur() {
    // Saved now, not after any save already under way: server actions run in
    // the order they are called, so starting this one here — blur fires on the
    // mousedown of Send now — puts the latest text ahead of the send.
    const [earlier, latest] = await Promise.all([inFlight.current, flush(value)]);
    inFlight.current = null;
    if (earlier || latest) router.refresh();
  }

  // Leaving the page inside the pause still saves what was typed.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null && pending.current.trim() !== sent.current.trim()) {
        void saveMessage(pending.current);
      }
    },
    [],
  );

  const near = value.length > MESSAGE_MAX * 0.8;

  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline px-4 py-4 md:px-5">
      <label htmlFor="newsletter-note" className="flex items-baseline gap-2 text-sm">
        Note at the top
        <span className="text-xs text-ash">optional · goes with this email only</span>
      </label>
      <textarea
        id="newsletter-note"
        value={value}
        maxLength={MESSAGE_MAX}
        rows={value ? 4 : 2}
        onChange={(event) => change(event.target.value)}
        onBlur={blur}
        placeholder="A line or two before the pictures — where you were, what’s coming."
        className="field-sizing-content min-h-16 resize-y rounded-md border border-hairline bg-frame px-3 py-2 text-sm leading-relaxed text-bone outline-none placeholder:text-ash focus:border-gold"
      />
      <span className="flex justify-between gap-4 text-[11px] text-ash" aria-live="polite">
        <span className={status === 'error' ? 'text-red-400' : ''}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? error : ''}
        </span>
        {near ? (
          <span className="tabular-nums">
            {value.length} / {MESSAGE_MAX}
          </span>
        ) : null}
      </span>
    </div>
  );
}

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

  async function flush(text: string): Promise<boolean> {
    clearTimeout(timer.current);
    if (text.trim() === saved.trim()) return false;
    setStatus('saving');
    const result = await saveMessage(text);
    if (result.error) {
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
    timer.current = setTimeout(() => {
      inFlight.current = flush(text);
    }, SAVE_AFTER_MS);
  }

  async function blur() {
    // A save already under way from the pause counts as this one.
    const changed = (await inFlight.current) || (await flush(value));
    inFlight.current = null;
    if (changed) router.refresh();
  }

  useEffect(() => () => clearTimeout(timer.current), []);

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

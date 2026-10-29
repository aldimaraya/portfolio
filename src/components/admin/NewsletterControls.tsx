'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { emailPreview, sendNow, setSkipped } from '@/app/admin/newsletter/actions';
import { BUTTON } from './fields';

/** "Send now" and "Email me a preview", with the outcome reported inline. */
export function BatchActions({ pending, canPreview }: { pending: number; canPreview: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ error?: string; message?: string } | null>(null);

  async function run(action: () => Promise<{ error?: string; message?: string }>) {
    setBusy(true);
    setOutcome(null);
    const result = await action();
    setBusy(false);
    setConfirming(false);
    setOutcome(result);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <span className="text-sm text-ash">Email every subscriber now?</span>
            <button type="button" onClick={() => run(sendNow)} disabled={busy} className={BUTTON}>
              {busy ? 'Sending…' : 'Yes, send'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-ash">
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy || pending === 0}
            className={BUTTON}
          >
            Send now
          </button>
        )}
        {canPreview ? (
          <button
            type="button"
            onClick={() => run(emailPreview)}
            disabled={busy || pending === 0}
            className="text-sm text-ash transition hover:text-bone disabled:opacity-50"
          >
            Email me a preview
          </button>
        ) : null}
      </div>
      {outcome?.error ? (
        <p role="alert" className="text-sm text-red-400">
          {outcome.error}
        </p>
      ) : null}
      {outcome?.message ? (
        <p role="status" className="text-sm text-bone">
          {outcome.message}
        </p>
      ) : null}
    </div>
  );
}

/** Takes one item out of the batch, or puts a skipped one back. */
export function SkipToggle({ id, skipped }: { id: string; skipped: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    setBusy(true);
    setError('');
    const result = await setSkipped(id, !skipped);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`text-sm transition disabled:opacity-50 ${
          skipped ? 'text-gold' : 'text-ash hover:text-red-400'
        }`}
      >
        {skipped ? 'Put back' : 'Leave out'}
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}

/**
 * A date in the admin's own timezone. The server renders in UTC, so the text is
 * replaced after hydration — suppressHydrationWarning covers that one swap.
 */
export function LocalTime({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <time dateTime={value} suppressHydrationWarning>
      {date.toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })}
    </time>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { emailPreview, sendNow } from '@/app/admin/newsletter/actions';
import { GHOST_BUTTON, GOLD_BUTTON } from '../fields';

type Outcome = { error?: string; message?: string };

/**
 * The header's "Send a test to me" and "Send now", with the outcome reported on
 * its own line under them. Send now asks once, naming how many people it is
 * about to email — the one action on the page that cannot be taken back.
 */
export function SendActions({
  pending,
  recipients,
  canSend,
  canPreview,
  resuming,
}: {
  /** Live items in the batch. */
  pending: number;
  /** Confirmed subscribers who would get something. */
  recipients: number;
  /** Production with email configured — anywhere else the server refuses. */
  canSend: boolean;
  canPreview: boolean;
  /** A dispatch stopped partway; Send now finishes it before anything else. */
  resuming: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function run(action: () => Promise<Outcome>) {
    setBusy(true);
    setOutcome(null);
    const result = await action();
    setBusy(false);
    setConfirming(false);
    setOutcome(result);
    router.refresh();
  }

  const sendable = canSend && (pending > 0 || resuming);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        {confirming ? (
          <>
            <span className="text-sm text-ash">
              {resuming
                ? 'Finish the stopped send now?'
                : `Email ${recipients} subscriber${recipients === 1 ? '' : 's'} now?`}
            </span>
            <button type="button" onClick={() => run(sendNow)} disabled={busy} className={GOLD_BUTTON}>
              {busy ? 'Sending…' : 'Yes, send'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={GHOST_BUTTON}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {canPreview ? (
              <button
                type="button"
                onClick={() => run(emailPreview)}
                disabled={busy || pending === 0}
                className={GHOST_BUTTON}
              >
                {busy ? 'Sending…' : 'Send a test to me'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy || !sendable}
              className={GOLD_BUTTON}
            >
              {resuming ? 'Finish sending' : `Send now · ${pending} item${pending === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
      {outcome?.error ? (
        <p role="alert" className="w-full text-sm text-red-400 md:order-last md:text-right">
          {outcome.error}
        </p>
      ) : null}
      {outcome?.message ? (
        <p role="status" className="w-full text-sm text-bone md:order-last md:text-right">
          {outcome.message}
        </p>
      ) : null}
    </>
  );
}

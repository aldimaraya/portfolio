'use client';

import Link from 'next/link';
import { useState } from 'react';
import { confirmSubscription } from '@/app/(site)/newsletter/actions';
import { rememberPromptAnswer } from '@/lib/newsletter/prompt';

/**
 * Confirmation takes a click on the page, not just a visit to the link. Mail
 * scanners (Outlook's Safe Links, corporate gateways) fetch every link in an
 * email before a person sees it, and a GET that confirmed would let a scanner
 * sign someone up — which is the one thing double opt-in exists to prevent.
 */
export function ConfirmButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function confirm() {
    setBusy(true);
    setError('');
    const result = await confirmSubscription(token);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    // Confirming may happen in a browser that never saw the prompt — a phone's
    // mail app, say. Record it here too so this one never asks.
    rememberPromptAnswer('subscribed');
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-3 text-sm leading-relaxed">
        <p className="text-bone">You’re subscribed. You’ll hear from me when something new goes up.</p>
        <p className="text-ash">
          Every email has a link to change what you get or unsubscribe.{' '}
          <Link href="/stills" className="text-gold hover:underline">
            Back to the site
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="self-start rounded border border-gold px-4 py-2 text-sm tracking-wider text-gold uppercase transition hover:bg-gold/10 disabled:opacity-50"
      >
        {busy ? 'Confirming…' : 'Confirm subscription'}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

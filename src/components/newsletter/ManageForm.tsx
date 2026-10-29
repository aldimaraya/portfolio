'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { unsubscribe, updatePreferences } from '@/app/(site)/newsletter/actions';
import { CONTENT_KINDS, type Preferences } from '@/lib/newsletter/kinds';
import { rememberPromptAnswer } from '@/lib/newsletter/prompt';
import { PreferenceFields } from './PreferenceFields';

export function ManageForm({ token, initial }: { token: string; initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [gone, setGone] = useState(false);

  // Only a subscriber has this link, so this browser has no need of the prompt.
  useEffect(() => rememberPromptAnswer('subscribed'), []);

  const nothingChosen = !CONTENT_KINDS.some((kind) => prefs[kind]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    const result = await updatePreferences(token, prefs);
    setBusy(false);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  async function leave() {
    setBusy(true);
    setError('');
    const result = await unsubscribe(token);
    setBusy(false);
    if (result.error) setError(result.error);
    else setGone(true);
  }

  if (gone) {
    return (
      <div role="status" className="flex flex-col gap-3 text-sm leading-relaxed">
        <p className="text-bone">You’re unsubscribed, and your address has been deleted.</p>
        <p className="text-ash">
          Changed your mind?{' '}
          <Link href="/newsletter" className="text-gold hover:underline">
            Subscribe again
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={save} className="flex flex-col gap-5">
        <PreferenceFields
          value={prefs}
          onChange={(next) => {
            setPrefs(next);
            setSaved(false);
          }}
          disabled={busy}
        />
        {nothingChosen ? (
          <p className="text-sm text-ash">
            Nothing ticked means no emails at all — unsubscribe below instead.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || nothingChosen}
          className="self-start rounded border border-gold px-4 py-2 text-sm tracking-wider text-gold uppercase transition hover:bg-gold/10 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved ? (
          <p role="status" className="text-sm text-bone">
            Saved.
          </p>
        ) : null}
      </form>

      <div className="border-t border-hairline pt-6">
        <button
          type="button"
          onClick={leave}
          disabled={busy}
          className="text-sm text-ash underline-offset-4 transition hover:text-bone hover:underline disabled:opacity-50"
        >
          Unsubscribe from everything
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

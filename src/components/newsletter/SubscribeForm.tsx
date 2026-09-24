'use client';

import { useId, useState } from 'react';
import { subscribe } from '@/app/(site)/newsletter/actions';
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/newsletter/kinds';
import { rememberPromptAnswer } from '@/lib/newsletter/prompt';
import { PreferenceFields } from './PreferenceFields';

/**
 * The signup form, used on /newsletter, inside the prompt, and at the foot of a
 * journal post. Wherever it is, a successful signup means the prompt never
 * needs to appear in this browser.
 *
 * `fixedPrefs` skips the checkboxes for a form whose context already says what
 * the reader wants — under a post, that is the next post. The choice can be
 * widened later from the manage link in every email.
 */
export function SubscribeForm({
  autoFocus,
  onSubscribed,
  fixedPrefs,
  inline,
}: {
  autoFocus?: boolean;
  onSubscribed?: () => void;
  fixedPrefs?: Preferences;
  /** Email and button on one line, label hidden — for places short on height. */
  inline?: boolean;
}) {
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState<Preferences>(fixedPrefs ?? DEFAULT_PREFERENCES);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await subscribe({ email, prefs, website });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    rememberPromptAnswer('subscribed');
    onSubscribed?.();
  }

  if (done) {
    // Worded to be true in every case the action reports as success — including
    // an address already subscribed, which it deliberately does not reveal.
    return (
      <p role="status" className="text-sm leading-relaxed text-bone">
        Check your inbox. If <span className="text-gold">{email.trim()}</span> isn’t
        already subscribed, a confirmation link is on its way. Nothing else is sent
        until it’s clicked.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={inline ? 'flex flex-col gap-3' : 'flex flex-col gap-5'}>
      <div className={inline ? 'flex flex-col gap-2 sm:flex-row' : 'flex flex-col gap-2'}>
        <label
          htmlFor={emailId}
          className={inline ? 'sr-only' : 'font-mono text-xs tracking-[0.15em] text-ash uppercase'}
        >
          Email
        </label>
        <input
          id={emailId}
          type="email"
          required
          autoFocus={autoFocus}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded border border-hairline bg-frame px-3 py-2 text-bone outline-none focus:border-gold"
        />
        {inline ? <SubmitButton busy={busy} /> : null}
      </div>

      {fixedPrefs ? null : <PreferenceFields value={prefs} onChange={setPrefs} disabled={busy} />}

      {/* Honeypot: off-screen rather than display:none, which some bots skip. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>

      {inline ? null : <SubmitButton busy={busy} />}

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton({ busy }: { busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="shrink-0 rounded border border-gold px-4 py-2 text-sm tracking-wider text-gold uppercase transition hover:bg-gold/10 disabled:opacity-50"
    >
      {busy ? 'Subscribing…' : 'Subscribe'}
    </button>
  );
}

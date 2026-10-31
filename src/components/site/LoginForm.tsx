'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.push(next);
      router.refresh();
      return;
    }

    // A 5xx means the server is misconfigured, not that the password is wrong —
    // say so, rather than letting a config error masquerade as a bad password.
    if (response.status >= 500) {
      setError('Server error — check the server logs and your .env values.');
      setBusy(false);
      return;
    }

    const data = await response.json().catch(() => null);
    setError(data?.error ?? `Login failed (HTTP ${response.status})`);
    setBusy(false);
  }

  return (
    // method="post" for the submit that happens before hydration (or when it never
    // comes — a dev origin Next refuses): the browser's default is GET, which puts
    // the password in the URL, the server log and the browser history. A POST to
    // this page signs nobody in, but it carries the password in the body, unlogged.
    <form method="post" onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <input
        type="password"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        aria-label="Password"
        autoFocus
        autoComplete="current-password"
        className="rounded border border-hairline bg-frame px-3 py-2 text-bone outline-none focus:border-gold"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded border border-gold px-3 py-2 text-gold transition hover:bg-gold/10 disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  action: (id: string) => Promise<{ error?: string }>;
  redirectTo: string;
  label: string;
}

/** Two-step confirm — deletion is irreversible and there is no undo. */
export function DeleteButton({ id, action, redirectTo, label }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    const result = await action(id);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start text-sm text-ash transition hover:text-red-400"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-ash">This cannot be undone.</span>
      <button type="button" onClick={remove} disabled={busy} className="text-sm text-red-400">
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-sm text-ash">
        Cancel
      </button>
      {error ? <span className="text-sm text-red-400">{error}</span> : null}
    </div>
  );
}

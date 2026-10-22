'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPost } from '@/app/admin/posts/actions';
import { BUTTON } from './fields';

/**
 * Starts a post and opens it in the editor. The draft row is created first so
 * the editor is always working on a post that exists — trip photos uploaded
 * before the first save need one to belong to.
 */
export function NewPostButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    const result = await createPost();
    if (!result.id) {
      setError(result.error ?? 'Could not start a post');
      setBusy(false);
      return;
    }
    router.push(`/admin/posts/${result.id}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={start} disabled={busy} className={BUTTON}>
        {busy ? 'Starting…' : 'New post'}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}

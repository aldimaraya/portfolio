'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MarkdownEditor } from './MarkdownEditor';
import { BUTTON, FIELD, LABEL } from './fields';
import { missingRequiredFields } from '@/lib/post/form';
import { slugify } from '@/lib/slug';
import { listPhrase } from '@/lib/text';
import { savePost, type PostInput } from '@/app/admin/posts/actions';

type Initial = Partial<PostInput> & { id?: string; slug?: string };

function buildForm(initial?: Initial): PostInput {
  return {
    id: initial?.id,
    title: initial?.title ?? '',
    markdownContent: initial?.markdownContent ?? '',
    // New posts start as drafts — publishing should be a deliberate act.
    draft: initial?.draft ?? true,
  };
}

export function PostForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState<PostInput>(() => buildForm(initial));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isEdit = Boolean(initial?.id);
  // Frozen once published: the slug is a public URL by then, and retitling must
  // not move it. savePost enforces this too; this only mirrors it on screen.
  const slugFrozen = isEdit && initial?.draft === false;
  const slug = slugFrozen ? (initial?.slug ?? '') : slugify(form.title);

  const missing = missingRequiredFields(form);
  const ready = missing.length === 0;

  function set<K extends keyof PostInput>(key: K, value: PostInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) {
      setError(`Still needs ${listPhrase(missing)}.`);
      return;
    }

    setBusy(true);
    setError('');

    const result = await savePost(form);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    if (isEdit) {
      router.push('/admin/posts');
      router.refresh();
      return;
    }

    // The create form is rendered *on* /admin/posts, so there is no navigation to
    // unmount it — reset by hand, ready for the next entry.
    setForm(buildForm());
    setError('');
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input
        className={FIELD}
        placeholder="Title (e.g. A morning in Namsan)"
        aria-label="Title"
        value={form.title}
        onChange={(event) => set('title', event.target.value)}
      />

      {/* Only once there is a title — slugify falls back to "post" for empty
          input, and showing /journal/post before anything is typed reads like a
          real destination. */}
      {form.title.trim() || slugFrozen ? (
        <p className="font-mono text-xs text-ash">
          /journal/{slug}
          {slugFrozen ? (
            <span className="text-gold"> · fixed on publish, so existing links keep working</span>
          ) : isEdit ? (
            <span> · still a draft, so this follows the title</span>
          ) : null}
        </p>
      ) : null}

      <MarkdownEditor
        value={form.markdownContent}
        onChange={(value) => set('markdownContent', value)}
      />

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!form.draft}
          onChange={(event) => set('draft', !event.target.checked)}
          className="accent-gold"
        />
        <span className={LABEL}>Published</span>
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button type="submit" disabled={busy || !ready} className={`${BUTTON} self-start`}>
        {busy ? 'Saving…' : form.draft ? 'Save draft' : 'Save and publish'}
      </button>

      {!busy && !ready ? (
        <p className="text-xs text-ash">Still needs {listPhrase(missing)}.</p>
      ) : null}
    </form>
  );
}

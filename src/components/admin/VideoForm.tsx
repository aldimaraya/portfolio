'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadField } from './UploadField';
import { TagInput } from './TagInput';
import { BUTTON, FIELD } from './fields';
import { generateSpriteSheet, type SpriteResult } from '@/lib/video/sprite';
import { missingRequiredFields, titleFromFilename } from '@/lib/video/form';
import { uploadFile } from '@/lib/storage/upload-client';
import { saveVideo, type VideoInput } from '@/app/admin/videos/actions';

/** "a title" · "a title and a roll" · "a video, a title and a roll". */
function listPhrase(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Clips are large; warn past this rather than silently starting a huge upload. */
const LARGE_VIDEO_BYTES = 200 * 1024 * 1024;

type Initial = Partial<VideoInput> & { id?: string };

function buildForm(initial?: Initial): VideoInput {
  return {
    id: initial?.id,
    videoUrl: initial?.videoUrl ?? '',
    posterImageUrl: initial?.posterImageUrl ?? '',
    spriteUrl: initial?.spriteUrl ?? '',
    spriteFrames: initial?.spriteFrames ?? 0,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    tags: initial?.tags ?? '',
  };
}

export function VideoForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState<VideoInput>(() => buildForm(initial));
  // The clip waits here until save — nothing reaches R2 before then.
  const [file, setFile] = useState<File | null>(null);
  const [sprite, setSprite] = useState<SpriteResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const isEdit = Boolean(initial?.id);

  const missing = missingRequiredFields({
    hasVideo: Boolean(file) || Boolean(form.videoUrl),
    hasPreview: Boolean(sprite) || Boolean(form.spriteUrl && form.posterImageUrl),
    title: form.title,
  });
  const ready = missing.length === 0 && !generating;

  // Preview the freshly generated strip. Derived, and revoked on replacement, so
  // the blobs are not pinned in memory for the life of the page.
  const spritePreview = useMemo(
    () => (sprite ? URL.createObjectURL(sprite.spriteBlob) : ''),
    [sprite],
  );
  useEffect(() => {
    if (!spritePreview) return;
    return () => URL.revokeObjectURL(spritePreview);
  }, [spritePreview]);

  function set<K extends keyof VideoInput>(key: K, value: VideoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Frames are grabbed locally, straight from the picked file — no upload, and no
   * server-side video processing anywhere in the pipeline.
   */
  async function handleSelect(picked: File | null) {
    setFile(picked);
    setError('');
    setSprite(null);
    if (!picked) return;

    // Offer the filename as a title, but never overwrite one already typed.
    setForm((prev) => ({
      ...prev,
      title: prev.title || titleFromFilename(picked.name),
    }));

    try {
      setGenerating(true);
      const result = await generateSpriteSheet(picked);
      setSprite(result);
      setForm((prev) => ({ ...prev, spriteFrames: result.frameCount }));
    } catch (cause) {
      // Leaves sprite null, which keeps the save button disabled rather than
      // storing a video with no scrub preview.
      setError(
        cause instanceof Error
          ? `Could not build a preview: ${cause.message}`
          : 'Could not build a preview',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function upload(blob: Blob, name: string, prefix: 'videos' | 'posters' | 'sprites') {
    setStage(prefix);
    setProgress(0);
    try {
      return await uploadFile(blob, name, prefix, setProgress);
    } finally {
      setProgress(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Re-checked here, not just on the button: a disabled button is a hint, not a
    // guarantee. This must stay ahead of the uploads so an incomplete form never
    // pushes a multi-hundred-megabyte clip that the server will then reject.
    if (!ready) {
      setError(`Still needs ${listPhrase(missing)}.`);
      return;
    }

    setBusy(true);
    setError('');

    let { videoUrl, posterImageUrl, spriteUrl } = form;
    try {
      const base = file ? file.name.replace(/\.[^.]+$/, '') : 'clip';
      if (file) videoUrl = await upload(file, file.name, 'videos');
      if (sprite) {
        posterImageUrl = await upload(sprite.posterBlob, `${base}-poster.webp`, 'posters');
        spriteUrl = await upload(sprite.spriteBlob, `${base}-sprite.webp`, 'sprites');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
      setBusy(false);
      setStage('');
      return;
    }
    setStage('');

    const result = await saveVideo({ ...form, videoUrl, posterImageUrl, spriteUrl });
    if (result.error) {
      // Everything is already in R2; keeping the URLs means a retry after fixing
      // the error does not re-upload the clip.
      setForm((prev) => ({ ...prev, videoUrl, posterImageUrl, spriteUrl }));
      setFile(null);
      setSprite(null);
      setResetKey((key) => key + 1);
      setError(result.error);
      setBusy(false);
      return;
    }

    if (isEdit) {
      router.push('/admin/videos');
      router.refresh();
      return;
    }

    // The create form is rendered *on* /admin/videos, so there is no navigation
    // to unmount it — reset by hand, ready for the next clip. Sort order is
    // assigned server-side, so nothing about position needs carrying over.
    setForm(buildForm());
    setFile(null);
    setSprite(null);
    setError('');
    setBusy(false);
    setResetKey((key) => key + 1);
    router.refresh();
  }

  const uploadLabel =
    stage === 'videos'
      ? 'Uploading clip'
      : stage === 'posters'
        ? 'Uploading poster'
        : stage === 'sprites'
          ? 'Uploading preview'
          : 'Saving';

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <UploadField
        key={resetKey}
        label="Video"
        accept="video/*"
        value={form.videoUrl}
        file={file}
        onSelect={handleSelect}
        previewAs="video"
        warnAboveBytes={LARGE_VIDEO_BYTES}
        hint="Frames are grabbed in your browser — nothing is transcoded on a server."
        allowSelect={!isEdit}
      />

      {generating ? <p className="text-xs text-gold">Grabbing frames…</p> : null}

      {sprite ? (
        <div className="rounded border border-hairline bg-film p-3">
          <p className="font-mono text-xs tracking-[0.15em] text-gold uppercase">
            Scrub preview
          </p>
          {/* The generated strip, shown so a bad grab is caught before upload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={spritePreview} alt="" className="mt-2 w-full rounded" />
          <p className="mt-2 font-mono text-xs text-ash">
            {sprite.frameCount} frames · {sprite.frameWidth}×{sprite.frameHeight} ·{' '}
            {sprite.durationSeconds.toFixed(1)}s
          </p>
        </div>
      ) : null}

      <input
        className={FIELD}
        placeholder="Title (e.g. Blue hour, Namsan)"
        aria-label="Title"
        value={form.title}
        onChange={(event) => set('title', event.target.value)}
      />
      <textarea
        className={`${FIELD} min-h-20 resize-y`}
        placeholder="Description (optional)"
        aria-label="Description"
        value={form.description}
        onChange={(event) => set('description', event.target.value)}
      />

      <TagInput value={form.tags} onChange={(value) => set('tags', value)} />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button type="submit" disabled={busy || !ready} className={BUTTON}>
        {busy
          ? progress !== null
            ? `${uploadLabel}… ${progress}%`
            : 'Saving…'
          : 'Save video'}
      </button>

      {!busy && !ready ? (
        <p className="text-xs text-ash">
          {generating ? 'Building the preview…' : `Still needs ${listPhrase(missing)}.`}
        </p>
      ) : null}
    </form>
  );
}

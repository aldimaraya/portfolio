'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadField } from './UploadField';
import { TagInput } from './TagInput';
import { BUTTON, FIELD } from './fields';
import { analyzeImageFile } from '@/lib/color/analyze-image';
import { savePhoto, type PhotoInput } from '@/app/admin/photos/actions';

export function PhotoForm({ initial }: { initial?: Partial<PhotoInput> & { id?: string } }) {
  const router = useRouter();
  const [form, setForm] = useState<PhotoInput>({
    id: initial?.id,
    imageUrl: initial?.imageUrl ?? '',
    width: initial?.width ?? 0,
    height: initial?.height ?? 0,
    location: initial?.location ?? '',
    camera: initial?.camera ?? '',
    filmStock: initial?.filmStock ?? '',
    avgHue: initial?.avgHue ?? 0,
    avgLightness: initial?.avgLightness ?? 0,
    isMonochrome: initial?.isMonochrome ?? false,
    tags: initial?.tags ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PhotoInput>(key: K, value: PhotoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Colour analysis runs on the local file, not the uploaded copy — no download,
  // and the result is stored so public pages never recompute it.
  async function handleUploaded(url: string, file: File) {
    const analysis = await analyzeImageFile(file);
    setForm((prev) => ({
      ...prev,
      imageUrl: url,
      width: analysis.width,
      height: analysis.height,
      avgHue: analysis.avgHue,
      avgLightness: analysis.avgLightness,
      isMonochrome: analysis.isMonochrome,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const result = await savePhoto(form);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    router.push('/admin/photos');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <UploadField
        label="Photo"
        accept="image/*"
        prefix="photos"
        value={form.imageUrl}
        onUploaded={handleUploaded}
      />

      {form.imageUrl ? (
        <p className="font-mono text-xs text-ash">
          {form.width}×{form.height} · hue {Math.round(form.avgHue)}° ·{' '}
          {form.isMonochrome ? 'black & white' : 'colour'}
        </p>
      ) : null}

      <input
        className={FIELD}
        placeholder="Location (e.g. Tokyo / Shinjuku)"
        aria-label="Location"
        value={form.location}
        onChange={(event) => set('location', event.target.value)}
      />
      <input
        className={FIELD}
        placeholder="Camera (e.g. Leica M6)"
        aria-label="Camera"
        value={form.camera}
        onChange={(event) => set('camera', event.target.value)}
      />
      <input
        className={FIELD}
        placeholder="Film stock or lens (e.g. Portra 400)"
        aria-label="Film stock or lens"
        value={form.filmStock}
        onChange={(event) => set('filmStock', event.target.value)}
      />

      <TagInput value={form.tags} onChange={(value) => set('tags', value)} />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button type="submit" disabled={busy} className={BUTTON}>
        {busy ? 'Saving…' : 'Save photo'}
      </button>
    </form>
  );
}

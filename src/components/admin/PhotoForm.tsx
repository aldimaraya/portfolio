'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadField } from './UploadField';
import { TagInput } from './TagInput';
import { TrimControls } from './TrimControls';
import { BUTTON, FIELD, LABEL } from './fields';
import { analyzePixels } from '@/lib/color/analyze';
import { NO_BORDER, hasBorder, type BorderInsets } from '@/lib/photo/border';
import { decodeImage, detectBorder, prepareUpload } from '@/lib/photo/trim-client';
import { extractPhotoExif, type PhotoExif } from '@/lib/photo/exif';
import {
  EMPTY_SETTINGS,
  settingsFromExif,
  type PhotoSettings,
} from '@/lib/photo/settings';
import { missingRequiredFields } from '@/lib/photo/form';
import { listPhrase } from '@/lib/text';
import { uploadFile } from '@/lib/storage/upload-client';
import { savePhoto, type PhotoInput } from '@/app/admin/photos/actions';

const SETTING_FIELDS: { key: keyof PhotoSettings; label: string; placeholder: string }[] = [
  { key: 'focalLength', label: 'Focal length', placeholder: '35mm' },
  { key: 'aperture', label: 'Aperture', placeholder: 'f/1.4' },
  { key: 'shutter', label: 'Shutter', placeholder: '1/250' },
  { key: 'iso', label: 'ISO', placeholder: '400' },
];

type Initial = Partial<PhotoInput> & { id?: string };

function buildForm(initial?: Initial): PhotoInput {
  return {
    id: initial?.id,
    imageUrl: initial?.imageUrl ?? '',
    width: initial?.width ?? 0,
    height: initial?.height ?? 0,
    location: initial?.location ?? '',
    camera: initial?.camera ?? '',
    settings: initial?.settings ?? EMPTY_SETTINGS,
    avgHue: initial?.avgHue ?? 0,
    avgLightness: initial?.avgLightness ?? 0,
    isMonochrome: initial?.isMonochrome ?? false,
    tags: initial?.tags ?? '',
  };
}

export function PhotoForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState<PhotoInput>(() => buildForm(initial));
  // The chosen file waits here until save — nothing reaches R2 before then.
  const [file, setFile] = useState<File | null>(null);
  const [exif, setExif] = useState<PhotoExif | null>(null);
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Bumped after a successful create to remount UploadField: its <input type="file">
  // is uncontrolled, so clearing React state alone would leave the old filename on
  // screen.
  const [resetKey, setResetKey] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  // The picked file's decoded bitmap, kept so the border can be re-cropped from
  // the full-quality source each time an inset changes — re-cropping the last
  // crop would compound the WebP loss with every nudge.
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const originalRef = useRef<File | null>(null);
  /** Whether the picked file carries EXIF — see the prepareUpload call below. */
  const hasMetadataRef = useRef(true);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [insets, setInsets] = useState<BorderInsets | null>(null);
  const [autoTrimmed, setAutoTrimmed] = useState(false);

  const isEdit = Boolean(initial?.id);

  const missing = missingRequiredFields({
    hasImage: Boolean(file) || Boolean(form.imageUrl),
    width: form.width,
    height: form.height,
    location: form.location,
    camera: form.camera,
  });
  const ready = missing.length === 0 && !analyzing;

  function set<K extends keyof PhotoInput>(key: K, value: PhotoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setSetting(key: keyof PhotoSettings, value: string) {
    setForm((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }

  // Decoded bitmaps hold their full pixel buffer; navigating away from the form
  // without closing one leaves tens of megabytes behind until GC gets to it.
  useEffect(() => () => bitmapRef.current?.close(), []);

  function clearImageState() {
    setExif(null);
    setPrefilled([]);
    setInsets(null);
    setBitmap(null);
    bitmapRef.current?.close();
    bitmapRef.current = null;
    originalRef.current = null;
    hasMetadataRef.current = true;
    // Dimensions describe the cleared file, so they must go with it — leaving
    // them set would let the form look complete with no image.
    setForm((prev) => ({ ...prev, width: 0, height: 0 }));
  }

  /**
   * Crops the picked file to the current insets, re-encodes it, and re-derives
   * the colour stats from the result. Always works from the decoded original, so
   * nudging an inset re-crops the source rather than the previous crop.
   *
   * Runs as an effect rather than inside the change handlers because both
   * picking a file and editing a side have to trigger it, and the two would
   * otherwise race: a slow first render could land after a fast re-crop and
   * overwrite it with the untrimmed result.
   */
  useEffect(() => {
    const source = bitmapRef.current;
    const original = originalRef.current;
    if (!source || !original || !insets) return;

    let cancelled = false;
    setAnalyzing(true);

    // Keeping the original bytes would publish its EXIF verbatim, so what the
    // file carries decides whether the re-encode is optional. Read from a ref
    // rather than state: it is set in the same handler as the bitmap, and it
    // should not be a reason to re-run this.
    prepareUpload(source, insets, original, hasMetadataRef.current)
      .then((prepared) => {
        if (cancelled) return;
        const colour = analyzePixels(prepared.pixels);
        // What gets uploaded on save — so the size the form reports is the size
        // that actually reaches R2, and the stats describe the cropped picture
        // rather than a frame the visitor never sees.
        setFile(prepared.file);
        setForm((prev) => ({
          ...prev,
          width: prepared.width,
          height: prepared.height,
          avgHue: colour.avgHue,
          avgLightness: colour.avgLightness,
          isMonochrome: colour.isMonochrome,
        }));
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not process that image');
        setForm((prev) => ({ ...prev, width: 0, height: 0 }));
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });

    return () => {
      cancelled = true;
    };
    // `bitmap` is the state mirror of bitmapRef, and is what marks a new file.
  }, [bitmap, insets]);

  /**
   * Reads the picked file locally — border detection, EXIF and colour all work
   * on the File in hand, so the preview and prefills cost nothing and need no
   * upload.
   */
  async function handleSelect(picked: File | null) {
    setFile(picked);
    setError('');
    if (!picked) {
      clearImageState();
      return;
    }

    let metadata: PhotoExif;
    let decoded: ImageBitmap;
    try {
      setAnalyzing(true);
      // EXIF comes off the *original* file: a canvas round-trip drops it
      // entirely, so metadata has to be read before the image is re-encoded.
      [decoded, metadata] = await Promise.all([
        decodeImage(picked),
        extractPhotoExif(picked),
      ]);
    } catch (cause) {
      // A file the browser cannot decode. Dimensions stay at zero, which keeps
      // the save button disabled rather than saving a broken record.
      setError(
        cause instanceof Error ? `Could not read that image: ${cause.message}` : 'Could not read that image',
      );
      clearImageState();
      setAnalyzing(false);
      return;
    }

    bitmapRef.current?.close();
    bitmapRef.current = decoded;
    originalRef.current = picked;
    hasMetadataRef.current = metadata.hasExif;
    setBitmap(decoded);

    // Detected up front so a framed export arrives already cropped, with the
    // sides on screen to correct. The effect above turns these into the file.
    const detected = detectBorder(decoded);
    setInsets(detected);
    setAutoTrimmed(hasBorder(detected));

    setExif(metadata);

    setForm((prev) => {
      // Prefill only what is still blank. Re-picking a file on an existing photo,
      // or typing before choosing one, must never be overwritten.
      const filled: string[] = [];
      const camera = prev.camera || metadata.camera || '';
      if (!prev.camera && metadata.camera) filled.push('camera');

      const fromExif = settingsFromExif(metadata);
      const settings = { ...prev.settings };
      for (const key of Object.keys(fromExif) as (keyof PhotoSettings)[]) {
        if (!settings[key] && fromExif[key]) {
          settings[key] = fromExif[key];
          filled.push(key === 'focalLength' ? 'focal length' : key);
        }
      }
      setPrefilled(filled);

      // Dimensions and colour are not set here: they describe the cropped,
      // re-encoded file, which the effect above produces.
      return { ...prev, camera, settings };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Re-checked here, not just on the button: a disabled button is a hint, not a
    // guarantee — Enter in a text field submits too. This must stay ahead of the
    // upload so an incomplete form never puts an orphaned object in R2.
    if (!ready) {
      setError(`Still needs ${listPhrase(missing)}.`);
      return;
    }

    setBusy(true);
    setError('');

    // The upload happens here, on confirm — not at pick time.
    let imageUrl = form.imageUrl;
    if (file) {
      try {
        setProgress(0);
        imageUrl = await uploadFile(file, file.name, 'photos', setProgress);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Upload failed');
        setBusy(false);
        setProgress(null);
        return;
      } finally {
        setProgress(null);
      }
    }

    const result = await savePhoto({ ...form, imageUrl });
    if (result.error) {
      // The image is already in R2 at this point; keeping the URL means a retry
      // after fixing the error does not re-upload it.
      setForm((prev) => ({ ...prev, imageUrl }));
      setFile(null);
      setResetKey((key) => key + 1);
      setError(result.error);
      setBusy(false);
      return;
    }

    if (isEdit) {
      // A real navigation away from /admin/photos/[id]; the form unmounts, so
      // leaving `busy` set keeps the button disabled until it does.
      router.push('/admin/photos');
      router.refresh();
      return;
    }

    // The create form is rendered *on* /admin/photos, so there is no navigation
    // to unmount it and clear its state — reset it by hand, ready for the next
    // photo. router.refresh() re-renders the list below with the new row.
    setForm(buildForm());
    setFile(null);
    clearImageState();
    setError('');
    setBusy(false);
    setResetKey((key) => key + 1);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <UploadField
        key={resetKey}
        label="Photo"
        accept="image/*"
        value={form.imageUrl}
        file={file}
        onSelect={handleSelect}
        progress={progress}
        allowSelect={!isEdit}
      />

      {/* Only for a freshly picked file. An already-stored photo is trimmed by
          BorderTrimmer on the edit page, which has to re-upload to change it. */}
      {bitmap && insets ? (
        <section className="flex flex-col gap-3 rounded border border-hairline bg-film p-3">
          <h3 className={LABEL}>Trim white border</h3>
          <p className="text-xs text-ash">
            {autoTrimmed
              ? 'Found a white border and cropped it. Adjust any side before saving.'
              : 'No white border found. Enter the sides by hand if you can see one.'}
          </p>
          <TrimControls
            bitmap={bitmap}
            insets={insets}
            onChange={setInsets}
            onRedetect={() => {
              const source = bitmapRef.current;
              if (source) setInsets(detectBorder(source));
            }}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => setInsets(NO_BORDER)}
            disabled={busy || !hasBorder(insets)}
            className="self-start text-sm text-ash transition hover:text-bone disabled:opacity-50"
          >
            Keep the border
          </button>
        </section>
      ) : null}

      {form.width ? (
        <p className="font-mono text-xs text-ash">
          {form.width}×{form.height} · hue {Math.round(form.avgHue)}° ·{' '}
          {form.isMonochrome ? 'black & white' : 'colour'}
        </p>
      ) : null}

      {exif ? (
        <div className="rounded border border-hairline bg-film p-3 text-xs">
          {exif.hasExif ? (
            <>
              <p className="font-mono tracking-[0.15em] text-gold uppercase">Read from EXIF</p>
              <dl className="mt-2 flex flex-col gap-1 text-ash">
                {exif.capturedAt ? (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0">Taken</dt>
                    <dd className="text-bone">{exif.capturedAt.toLocaleString()}</dd>
                  </div>
                ) : null}
                {exif.coordinates ? (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0">Coordinates</dt>
                    <dd className="font-mono text-bone">{exif.coordinates}</dd>
                  </div>
                ) : null}
              </dl>
              {prefilled.length ? (
                <p className="mt-2 text-ash">
                  Prefilled {listPhrase(prefilled)} below — edit freely.
                </p>
              ) : (
                <p className="mt-2 text-ash">Nothing left to prefill.</p>
              )}
            </>
          ) : (
            <p className="text-ash">
              No EXIF metadata in this file — common in exported or screenshotted
              images. Fill the fields in by hand.
            </p>
          )}
        </div>
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
        placeholder="Camera (e.g. Sony A7 IV)"
        aria-label="Camera"
        value={form.camera}
        onChange={(event) => set('camera', event.target.value)}
      />
      <input
        className={FIELD}
        placeholder="Lens (e.g. Sigma 35mm F1.4 DG HSM)"
        aria-label="Lens"
        value={form.settings.lens}
        onChange={(event) => setSetting('lens', event.target.value)}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className={LABEL}>Settings</legend>
        <div className="grid grid-cols-2 gap-2">
          {SETTING_FIELDS.map(({ key, label, placeholder }) => (
            <input
              key={key}
              className={FIELD}
              placeholder={`${label} (${placeholder})`}
              aria-label={label}
              value={form.settings[key]}
              onChange={(event) => setSetting(key, event.target.value)}
            />
          ))}
        </div>
      </fieldset>

      <TagInput value={form.tags} onChange={(value) => set('tags', value)} />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button type="submit" disabled={busy || !ready} className={BUTTON}>
        {busy ? (progress !== null ? `Uploading… ${progress}%` : 'Saving…') : 'Save photo'}
      </button>

      {/* Says why the button is disabled — a dead control with no explanation
          reads as a broken page. */}
      {!busy && !ready ? (
        <p className="text-xs text-ash">
          {analyzing ? 'Reading the image…' : `Still needs ${listPhrase(missing)}.`}
        </p>
      ) : null}
    </form>
  );
}

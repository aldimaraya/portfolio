'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadField } from './UploadField';
import { TagInput } from './TagInput';
import { BUTTON, FIELD, LABEL } from './fields';
import {
  generateSpriteSheet,
  type SpriteProgress,
  type SpriteResult,
} from '@/lib/video/sprite';
import { inspectAudio } from '@/lib/video/audio';
import {
  estimatedBitrate,
  formatMbps,
  formatMegabytes,
  shouldTranscode,
  type TranscodePlan,
} from '@/lib/video/transcode';
import {
  canTranscodeHere,
  isCancellation,
  probeVideo,
  transcodeVideo,
} from '@/lib/video/transcode-client';
import { missingRequiredFields, titleFromFilename } from '@/lib/video/form';
import { listPhrase } from '@/lib/text';
import { uploadFile } from '@/lib/storage/upload-client';
import { saveVideo, type VideoInput } from '@/app/admin/videos/actions';

/** Clips are large; warn past this rather than silently starting a huge upload. */
const LARGE_VIDEO_BYTES = 200 * 1024 * 1024;

type Initial = Partial<VideoInput> & { id?: string };

/**
 * What the save-time re-encode produced: the file to upload, and the dimensions
 * to store if they changed. Omitted when the original was kept, in which case
 * the dimensions already on the form still describe it.
 */
interface EncodeResult {
  file: File;
  width?: number;
  height?: number;
}

/**
 * The filename an R2 URL was stored under. Only used to name the regenerated
 * poster and sprite after it, so a fallback is fine — nothing depends on it
 * matching.
 */
function storedName(url: string): string {
  const last = url.split('?')[0].split('/').pop() ?? '';
  return last || 'clip.mp4';
}

function buildForm(initial?: Initial): VideoInput {
  return {
    id: initial?.id,
    videoUrl: initial?.videoUrl ?? '',
    posterImageUrl: initial?.posterImageUrl ?? '',
    spriteUrl: initial?.spriteUrl ?? '',
    spriteFrames: initial?.spriteFrames ?? 0,
    width: initial?.width ?? 0,
    height: initial?.height ?? 0,
    durationSeconds: initial?.durationSeconds ?? 0,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    tags: initial?.tags ?? '',
  };
}

export function VideoForm({ initial, tagOptions }: { initial?: Initial; tagOptions: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState<VideoInput>(() => buildForm(initial));
  // The clip waits here until save — nothing reaches R2 before then.
  const [file, setFile] = useState<File | null>(null);
  const [sprite, setSprite] = useState<SpriteResult | null>(null);
  const [generating, setGenerating] = useState(false);
  /**
   * Frames captured so far, shown as a percentage for the same reason uploads
   * are: eighteen seeks through a long clip is long enough that silence reads as
   * a hang. Null until the frame count is known — the metadata wait comes first
   * and has nothing to count.
   */
  const [grabbed, setGrabbed] = useState<SpriteProgress | null>(null);
  // Downloading the stored clip back for a re-grab, which for a large clip is
  // long enough that saying nothing would read as a dead button.
  const [fetching, setFetching] = useState(false);
  /**
   * The file the frames came from — the picked one, or the stored clip pulled
   * back for a regenerate. Held so moving the preview window can re-grab without
   * a second download; dropped only when the form resets.
   */
  const [source, setSource] = useState<File | null>(null);
  /** Where the preview window currently opens, in seconds into the clip. */
  const [windowAt, setWindowAt] = useState(0);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  // Advisory only, never blocking: a clip whose audio the browser cannot decode
  // is still a clip worth publishing if that is what the admin intends.
  const [audioWarning, setAudioWarning] = useState('');
  /**
   * The re-encode this clip needs, decided when it was picked and carried out on
   * save. Null when the clip is already within target, could not be read, or is
   * one this browser cannot decode — all of which upload as-is.
   */
  const [plan, setPlan] = useState<TranscodePlan | null>(null);
  /**
   * Running that re-encode, during save. On the hardware encoder, but a long clip
   * is still minutes, so it reports progress and can be cancelled.
   */
  const [transcoding, setTranscoding] = useState(false);
  const [transcoded, setTranscoded] = useState(0);
  /**
   * Reading the picked clip's shape to decide whether it needs re-encoding. Its
   * own stage because it is not instant — it pulls in the ~500 kB media library
   * on first use — and a picked clip sitting there with no readout at all is
   * what makes the whole step look like it never ran.
   */
  const [inspecting, setInspecting] = useState(false);
  /** What the re-encode achieved, or why it was skipped. Shown, never blocking. */
  const [transcodeNote, setTranscodeNote] = useState('');
  const transcodeAbort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const isEdit = Boolean(initial?.id);
  /**
   * Nothing below the picker means anything until there is a clip to describe —
   * a title and tags typed against no video are fields that cannot be saved, so
   * the create form opens as one question rather than five.
   */
  const hasClip = isEdit || Boolean(file) || Boolean(form.videoUrl);

  const missing = missingRequiredFields({
    hasVideo: Boolean(file) || Boolean(form.videoUrl),
    hasPreview: Boolean(sprite) || Boolean(form.spriteUrl && form.posterImageUrl),
    title: form.title,
  });
  const ready =
    missing.length === 0 && !generating && !fetching && !transcoding && !inspecting;

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

  // The clip itself, for the scrubber beside the window slider. Same derive-and-
  // revoke as above: this one holds the whole file, so leaking it pins a few
  // hundred megabytes for the life of the page.
  const sourcePreview = useMemo(
    () => (source ? URL.createObjectURL(source) : ''),
    [source],
  );
  useEffect(() => {
    if (!sourcePreview) return;
    return () => URL.revokeObjectURL(sourcePreview);
  }, [sourcePreview]);

  /**
   * Parks the scrubber on the first frame the window would take. Driven off the
   * slider rather than played, so finding a window is watching the clip rather
   * than grabbing eighteen frames to see what was there — the seek is one frame
   * of decoding, where a grab is eighteen.
   */
  const scrubber = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = scrubber.current;
    if (!video || !sourcePreview) return;
    // readyState below HAVE_METADATA means there is no seekable timeline yet;
    // the loadedmetadata handler on the element covers that first seek.
    if (video.readyState >= 1) video.currentTime = windowAt;
  }, [windowAt, sourcePreview]);

  function set<K extends keyof VideoInput>(key: K, value: VideoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Sizes up a picked clip and grabs its frames. Deliberately does *not*
   * re-encode: that is minutes of the machine's fans for a clip that might be
   * replaced or removed a moment later, so it waits for save, when the decision
   * to publish has actually been made. All that happens here is a header read,
   * which costs kilobytes and tells the admin up front what save will do.
   */
  async function handleSelect(picked: File | null) {
    setFile(picked);
    setSource(picked);
    setError('');
    setAudioWarning('');
    setTranscodeNote('');
    setPlan(null);
    setSprite(null);
    if (!picked) return;

    // Not awaited with the work below: reading the container is quick, and a
    // codec warning is worth showing while the frames are still being grabbed.
    inspectAudio(picked).then((problem) => setAudioWarning(problem ?? ''));

    // Offer the filename as a title, but never overwrite one already typed.
    setForm((prev) => ({
      ...prev,
      title: prev.title || titleFromFilename(picked.name),
    }));

    // Phones do not re-encode at all, and are not even asked to size the clip up
    // — skipping the probe keeps the ~500 kB media library off a mobile
    // connection, since its only reader here is a decision already made.
    if (canTranscodeHere()) {
      await inspect(picked);
    } else {
      setTranscodeNote(
        'Re-encoding is skipped on phones, so this uploads at its original size. Save it from a desktop to have it compressed.',
      );
    }

    await grabFrames(picked);
  }

  /**
   * Reads the picked clip's shape and decides whether saving it should re-encode
   * it, holding that verdict until then. Says what it found either way — a clip
   * that was already encoded by hand is the common case, and with no note the
   * check it just passed is indistinguishable from a step that never ran.
   */
  async function inspect(picked: File) {
    let probe;
    try {
      setInspecting(true);
      probe = await probeVideo(picked);
    } catch {
      // A container we cannot even read the header of. generateSpriteSheet gets
      // the same file next and will produce the real error if it is truly broken.
      setTranscodeNote('Could not read that clip to size it up, so it will be uploaded as-is.');
      return;
    } finally {
      setInspecting(false);
    }

    if (!probe.canDecode) {
      setTranscodeNote(
        'This browser cannot decode that clip, so it will be uploaded as-is. Encode it to H.264 locally first if it is a master.',
      );
      return;
    }

    const rate = formatMbps(estimatedBitrate(picked.size, probe.durationSeconds));
    const found = `${probe.width}×${probe.height}${rate ? `, ~${rate}` : ''}`;

    const next = shouldTranscode({
      bytes: picked.size,
      durationSeconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
    });

    if (!next) {
      setTranscodeNote(`Already within target (${found}) — will upload as-is.`);
      return;
    }

    setPlan(next);
    setTranscodeNote(
      `${found}. Will be re-encoded to ${next.width}×${next.height} at ~${formatMbps(next.videoBitrate)} when you save.`,
    );
  }

  /**
   * Drops the picked clip and everything derived from it, putting the create
   * form back where it started. Nothing has reached R2 at this point — and with
   * the re-encode deferred to save, nothing expensive has been spent on it
   * either, which is the point of deferring it.
   *
   * Only reachable while idle: mid-save the field withdraws this, because the
   * way out of a running encode is its own Cancel button.
   */
  function clearSelection() {
    setFile(null);
    setSource(null);
    setSprite(null);
    setPlan(null);
    setWindowAt(0);
    setError('');
    setAudioWarning('');
    setTranscodeNote('');
    // The dimensions describe the file being dropped, so they go with it —
    // leaving them would let the next pick inherit the last one's shape.
    setForm((prev) => ({
      ...prev,
      spriteFrames: 0,
      width: 0,
      height: 0,
      durationSeconds: 0,
    }));
    // Remounts UploadField, clearing the native input — which otherwise still
    // holds the old filename and will not fire onChange for re-picking it.
    setResetKey((key) => key + 1);
  }

  /**
   * Runs the re-encode decided at pick time. Called from submit, so this is the
   * one place the machine does real work on a clip — by which point the clip is
   * being published rather than merely looked at.
   *
   * Returns the file to upload and the dimensions to store with it. Falls back to
   * the original on any failure: a clip the browser cannot re-encode is still a
   * clip worth publishing, and refusing to upload it would be a worse answer than
   * spending the bytes. Cancelling is the one case that stops the save, and it
   * throws so submit can abandon it without uploading anything.
   */
  async function encode(picked: File, using: TranscodePlan): Promise<EncodeResult> {
    const controller = new AbortController();
    transcodeAbort.current = controller;
    setTranscoding(true);
    setTranscoded(0);

    try {
      const result = await transcodeVideo(picked, using, {
        signal: controller.signal,
        onProgress: (fraction) => setTranscoded(Math.round(fraction * 100)),
      });

      if (result === picked) {
        setTranscodeNote(
          `Kept the original — re-encoding it did not save anything (${formatMegabytes(picked.size)}).`,
        );
        return { file: picked };
      }

      setTranscodeNote(
        `Re-encoded: ${formatMegabytes(picked.size)} → ${formatMegabytes(result.size)}.`,
      );

      // The stored dimensions have to describe the stored bytes, and the ones on
      // the form came from the original. Read them back off the encode rather
      // than trusting the plan — another header read, and the alternative is a
      // row that quietly disagrees with the file it points at.
      try {
        const after = await probeVideo(result);
        return { file: result, width: after.width, height: after.height };
      } catch {
        // The encode is still good; only the measurement failed. The plan's
        // dimensions preserve the source aspect ratio, which is all the roll
        // actually reads these columns for.
        return { file: result, width: using.width, height: using.height };
      }
    } catch (cause) {
      if (isCancellation(cause)) throw cause;
      setTranscodeNote(
        `Could not re-encode this clip (${
          cause instanceof Error ? cause.message : 'unknown error'
        }), so it was uploaded as-is.`,
      );
      return { file: picked };
    } finally {
      setTranscoding(false);
      setTranscoded(0);
      transcodeAbort.current = null;
    }
  }

  /**
   * Grabs the scrub preview from a local file and records everything only the
   * file itself can answer. This is the sole writer of width, height and
   * duration — nothing server-side ever opens the stored copy.
   */
  async function grabFrames(from: File, startSeconds?: number) {
    try {
      setGenerating(true);
      setGrabbed(null);
      const result = await generateSpriteSheet(from, { startSeconds, onProgress: setGrabbed });
      setSprite(result);
      // Where the grab actually landed after clamping, so the control below
      // agrees with the strip above it.
      setWindowAt(result.startSeconds);
      setForm((prev) => ({
        ...prev,
        spriteFrames: result.frameCount,
        width: result.videoWidth,
        height: result.videoHeight,
        durationSeconds: result.durationSeconds,
      }));
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
      setGrabbed(null);
    }
  }

  /**
   * Re-grabs the frames from the clip already in R2, for a preview that came out
   * badly — or, as with the clips stored before the dimension columns existed, a
   * row whose width and height are still 0 and whose thumbnail is therefore the
   * wrong shape on the roll.
   *
   * The file comes back through our own origin (`/api/admin/video-source`)
   * because a canvas drawn from the public R2 host would be tainted. That means
   * the whole clip is downloaded once, here, in the browser.
   *
   * Deliberately never re-encodes: the stored clip already *is* the encode, so
   * running it through again would cost a generation every time a preview was
   * redone. This calls grabFrames directly rather than handleSelect for exactly
   * that reason — keep it that way.
   */
  async function regenerate() {
    if (!form.videoUrl) return;
    setError('');
    setSprite(null);
    setFetching(true);

    try {
      const response = await fetch(
        `/api/admin/video-source?url=${encodeURIComponent(form.videoUrl)}`,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not fetch the stored clip');
      }
      const blob = await response.blob();
      // Kept, so moving the window afterwards re-grabs from memory rather than
      // downloading the clip again for every adjustment.
      const fetched = new File([blob], storedName(form.videoUrl), { type: blob.type });
      setSource(fetched);
      await grabFrames(fetched);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not fetch the stored clip');
    } finally {
      setFetching(false);
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
    // Dimensions the encode may correct, so the row describes the stored bytes
    // rather than the file that was picked. Left empty unless it actually
    // resized — spreading an absent width over the form would wipe the one
    // grabFrames measured.
    let measured: { width: number; height: number } | null = null;
    try {
      // Names the poster and sprite after the clip, whether it is being uploaded
      // now or was uploaded some time ago and is only having its preview redone.
      const name = file?.name ?? (form.videoUrl ? storedName(form.videoUrl) : 'clip');
      const base = name.replace(/\.[^.]+$/, '');
      if (file) {
        // The re-encode happens here rather than at pick time, so the machine
        // only does it for a clip actually being published.
        const encoded: EncodeResult = plan ? await encode(file, plan) : { file };
        if (encoded.width && encoded.height) {
          measured = { width: encoded.width, height: encoded.height };
        }
        videoUrl = await upload(encoded.file, encoded.file.name, 'videos');
      }
      if (sprite) {
        posterImageUrl = await upload(sprite.posterBlob, `${base}-poster.webp`, 'posters');
        spriteUrl = await upload(sprite.spriteBlob, `${base}-sprite.webp`, 'sprites');
      }
    } catch (cause) {
      // Cancelling the encode abandons the save without touching anything —
      // the clip, the title and the tags are all still here to save again.
      if (isCancellation(cause)) {
        setTranscodeNote('Re-encode cancelled — nothing was uploaded.');
        setBusy(false);
        setStage('');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Upload failed');
      setBusy(false);
      setStage('');
      return;
    }
    setStage('');

    const result = await saveVideo({
      ...form,
      ...(measured ?? {}),
      videoUrl,
      posterImageUrl,
      spriteUrl,
    });
    if (result.error) {
      // Everything is already in R2; keeping the URLs means a retry after fixing
      // the error does not re-upload the clip.
      setForm((prev) => ({ ...prev, ...(measured ?? {}), videoUrl, posterImageUrl, spriteUrl }));
      setFile(null);
      setSprite(null);
      // The clip is in R2 now, so a retry must not re-encode what it already
      // uploaded — the URLs above are what the retry saves.
      setPlan(null);
      setTranscodeNote('');
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
    setSource(null);
    setSprite(null);
    setPlan(null);
    setWindowAt(0);
    setError('');
    setAudioWarning('');
    setTranscodeNote('');
    setBusy(false);
    setResetKey((key) => key + 1);
    router.refresh();
  }

  // The latest the window can open and still fit inside the clip. 0 for a clip
  // shorter than the window, which is sampled end to end and has no choice to
  // offer.
  const windowMax = sprite ? Math.max(0, sprite.durationSeconds - sprite.windowSeconds) : 0;
  // How far the slider has been dragged from where the current strip was taken.
  // Below a tenth of a second there is nothing new to grab.
  const moved = sprite ? Math.abs(windowAt - sprite.startSeconds) : 0;

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
        // Withdrawn mid-save: the way out of a running encode is its own Cancel
        // button, and clearing the field would not stop an upload already going.
        onClear={busy ? undefined : clearSelection}
        previewAs="video"
        warnAboveBytes={LARGE_VIDEO_BYTES}
        // Says "on desktop" rather than reading the device here: this renders
        // before anything is picked, and branching on navigator would differ
        // between the server render and the client one.
        hint="Frames are grabbed in your browser, and on desktop clips over 1080p or ~6 Mbps are re-encoded there when you save — nothing touches a server."
        allowSelect={!isEdit}
      />

      {/* The encode runs before the frame grab and is much the longest thing
          that happens to a picked clip — minutes on a big one. A single line of
          text was too quiet for a wait that long, so this one gets a filled bar
          and a way out. */}
      {transcoding ? (
        <div className="rounded border border-gold/40 bg-gold/5 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-gold" aria-live="polite">
              Re-encoding for the web… {transcoded}%
            </p>
            <button
              type="button"
              onClick={() => transcodeAbort.current?.abort()}
              className="shrink-0 text-xs text-ash underline underline-offset-2 hover:text-gold"
            >
              Cancel
            </button>
          </div>
          {/* Percentages alone read as stalled on a long clip; a bar that has
              visibly moved does not. */}
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded bg-hairline"
            role="progressbar"
            aria-valuenow={transcoded}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Re-encoding progress"
          >
            <div
              className="h-full bg-gold transition-[width] duration-300"
              style={{ width: `${transcoded}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ash">
            Runs on your graphics hardware, in this tab — keep it open until it finishes.
          </p>
        </div>
      ) : inspecting ? (
        <p className="text-xs text-gold" aria-live="polite">
          Sizing up the clip…
        </p>
      ) : fetching ? (
        <p className="text-xs text-gold">Fetching the stored clip…</p>
      ) : generating ? (
        // Same shape as the upload readout below, so the two stages of one save
        // read as one system rather than as two widgets.
        <p className="text-xs text-gold" aria-live="polite">
          {grabbed ? `Grabbing frames… ${grabbed.percent}%` : 'Grabbing frames…'}
        </p>
      ) : null}

      {audioWarning ? (
        <p className="rounded border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-400">
          {audioWarning}
        </p>
      ) : null}

      {transcodeNote ? (
        <p className="text-xs text-ash" aria-live="polite">
          {transcodeNote}
        </p>
      ) : null}

      {/* The preview is otherwise frozen at upload: the frames are grabbed in the
          browser, and on the edit page there is no local file to grab them from.
          This pulls the stored clip back and re-grabs, which is also the only way
          to fill in the dimensions of a clip stored before those columns
          existed. */}
      {isEdit ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={regenerate}
            disabled={busy || fetching || generating || !form.videoUrl}
            className={BUTTON}
          >
            Regenerate preview frames
          </button>
          <span className="text-xs text-ash">
            Downloads the clip to your browser to re-grab its frames. Save afterwards to keep
            the new preview.
          </span>
        </div>
      ) : null}

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

          {/* The preview is a short window, not the whole clip — frames far apart
              read as a slideshow rather than as motion. Which window is a guess
              the code makes at a fifth of the way in; this is that guess handed
              to whoever has actually watched the clip. The source file is still
              in memory, so moving it costs a re-grab, not a re-download. */}
          {source && windowMax > 0 ? (
            <div className="mt-3 border-t border-hairline pt-3">
              <div className="flex items-baseline justify-between">
                <span className={LABEL}>Frames from</span>
                <span className="font-mono text-xs text-ash tabular-nums">
                  {windowAt.toFixed(1)}s – {(windowAt + sprite.windowSeconds).toFixed(1)}s
                </span>
              </div>

              {/* No controls: the slider below is this video's transport. Letting
                  it be played independently would only let the picture and the
                  window disagree about where they are. */}
              <video
                ref={scrubber}
                src={sourcePreview}
                muted
                playsInline
                preload="metadata"
                // The first seek, for which the effect above is too early — there
                // is no seekable timeline until the metadata has loaded.
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = windowAt;
                }}
                style={{ aspectRatio: `${sprite.videoWidth} / ${sprite.videoHeight}` }}
                className="mt-2 max-h-64 w-full rounded border border-hairline bg-black object-contain"
              />

              <input
                type="range"
                min={0}
                max={windowMax}
                step={0.1}
                value={Math.min(windowAt, windowMax)}
                disabled={generating}
                onChange={(event) => setWindowAt(Number(event.target.value))}
                aria-label="Where the preview window opens"
                className="mt-2 w-full accent-gold"
              />
              <button
                type="button"
                onClick={() => grabFrames(source, windowAt)}
                disabled={generating || moved < 0.05}
                className={`${BUTTON} mt-2`}
              >
                {moved < 0.05 ? 'Frames are from here' : 'Grab frames from here'}
              </button>
            </div>
          ) : null}
        </div>
      ) : isEdit && form.spriteUrl ? (
        <div className="rounded border border-hairline bg-film p-3">
          <p className="font-mono text-xs tracking-[0.15em] text-ash uppercase">
            Stored preview
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.spriteUrl} alt="" className="mt-2 w-full rounded" />
          <p className="mt-2 font-mono text-xs text-ash">
            {form.spriteFrames} frames · {form.width}×{form.height}
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {/* Everything below is about a clip. With none picked there is nothing to
          title or tag, so the create form opens as a single question. */}
      {hasClip ? (
        <>
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

          <TagInput
            value={form.tags}
            onChange={(value) => set('tags', value)}
            suggestions={tagOptions}
          />

          <button type="submit" disabled={busy || !ready} className={BUTTON}>
            {busy
              ? // The re-encode runs first and has its own percentage, which is
                // not an upload percentage — saying "Uploading" through it would
                // be a lie about where the time is going.
                transcoding
                ? `Re-encoding… ${transcoded}%`
                : progress !== null
                  ? `${uploadLabel}… ${progress}%`
                  : 'Saving…'
              : 'Save video'}
          </button>

          {!busy && !ready ? (
            <p className="text-xs text-ash">
              {/* No re-encode branch here: that only runs during a save, when
                  this hint is hidden behind `busy` and the button says so. */}
              {inspecting
                ? 'Sizing up the clip…'
                : generating || fetching
                  ? 'Building the preview…'
                  : `Still needs ${listPhrase(missing)}.`}
            </p>
          ) : null}
        </>
      ) : null}
    </form>
  );
}

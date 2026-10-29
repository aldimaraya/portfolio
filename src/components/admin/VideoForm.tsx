'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
  downloadFilename,
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
import { isCustomPoster } from '@/lib/video/cover';
import { prepareCover } from '@/lib/video/cover-client';
import { encodedFilename } from '@/lib/photo/compress';
import { missingRequiredFields, titleFromFilename } from '@/lib/video/form';
import { listPhrase } from '@/lib/text';
import { uploadFile } from '@/lib/storage/upload-client';
import { saveVideo, type VideoInput } from '@/app/admin/videos/actions';

/** Clips are large; warn past this rather than silently starting a huge upload. */
const LARGE_VIDEO_BYTES = 200 * 1024 * 1024;

type Initial = Partial<VideoInput> & { id?: string };

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
    rollId: initial?.rollId ?? '',
    tags: initial?.tags ?? '',
  };
}

export interface RollOption {
  id: string;
  name: string;
}

export function VideoForm({
  initial,
  tagOptions,
  rolls,
  returnTo = '/admin/videos',
}: {
  initial?: Initial;
  tagOptions: string[];
  /** In roll order. Empty means there is nowhere to file a clip yet. */
  rolls: RollOption[];
  /** Where a saved edit goes. Already reduced to a same-site path by the page. */
  returnTo?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<VideoInput>(() =>
    // The first roll rather than a blank "pick one": most uploads go to it, and
    // a clip with no roll cannot be saved anyway. That includes a clip older than
    // rolls, which /motion already shows on the first roll — so saving it there
    // files it where it was already being read.
    buildForm({ ...initial, rollId: initial?.rollId || rolls[0]?.id }),
  );
  // The clip waits here until save — nothing reaches R2 before then. Once a
  // re-encode finishes this is the encode, not the pick: it is what gets uploaded.
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
   * Re-encoding the picked clip, which starts as soon as it is picked. On the
   * hardware encoder, but a long clip is still minutes, so it reports progress and
   * can be cancelled — and the title and tags can be filled in while it runs.
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
  /**
   * Whether `file` is an encode rather than the pick itself — the only case worth
   * offering for download, since the original is already on disk.
   */
  const [encoded, setEncoded] = useState(false);
  /** What the re-encode achieved, or why it was skipped. Shown, never blocking. */
  const [transcodeNote, setTranscodeNote] = useState('');
  const transcodeAbort = useRef<AbortController | null>(null);
  /**
   * Bumped by every pick and every Remove. Probing, encoding and frame-grabbing
   * are all async and minutes can separate their start from their end, so each
   * one checks this before writing anything back — otherwise a clip swapped out
   * mid-encode would land its result on the form of the clip that replaced it.
   */
  const pickId = useRef(0);
  /**
   * A hand-picked thumbnail, already re-encoded (see lib/video/cover-client) so
   * the field previews and sizes exactly what will be uploaded. Optional: without
   * one, the poster is the first preview frame, as it always was.
   */
  const [cover, setCover] = useState<File | null>(null);
  const [preparingCover, setPreparingCover] = useState(false);
  const [coverError, setCoverError] = useState('');
  // Its own, so clearing the thumbnail does not also remount the video field.
  const [coverKey, setCoverKey] = useState(0);
  // Picking twice in quick succession must not let the slower first one win.
  const coverPick = useRef(0);
  /**
   * Set when a stored cover is being swapped back for a grabbed frame. Needs a
   * fresh grab to have a frame to swap in, which is why choosing it starts one.
   */
  const [dropCover, setDropCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const isEdit = Boolean(initial?.id);
  /** The stored poster is a cover, and is staying. */
  const keepsCover = isCustomPoster(form.posterImageUrl) && !dropCover;
  /**
   * Nothing below the picker means anything until there is a clip to describe —
   * a title and tags typed against no video are fields that cannot be saved, so
   * the create form opens as one question rather than five.
   */
  const hasClip = isEdit || Boolean(file) || Boolean(form.videoUrl);

  const missing = missingRequiredFields({
    hasVideo: Boolean(file) || Boolean(form.videoUrl),
    // A dropped cover leaves the stored poster pointing at it, so it counts for
    // nothing until a grab has produced the frame that replaces it.
    hasPreview:
      Boolean(sprite) || Boolean(form.spriteUrl && form.posterImageUrl && !dropCover),
    title: form.title,
    hasRoll: Boolean(form.rollId),
  });
  const ready =
    missing.length === 0 &&
    !generating &&
    !fetching &&
    !transcoding &&
    !inspecting &&
    !preparingCover;

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

  // Navigating away mid-encode must stop the encoder, not just orphan its
  // promise — otherwise it keeps the machine busy and the output pinned in memory.
  useEffect(() => () => transcodeAbort.current?.abort(), []);

  function set<K extends keyof VideoInput>(key: K, value: VideoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Starts a new pick, stopping whatever the last one still had running. */
  function supersede(): number {
    transcodeAbort.current?.abort();
    transcodeAbort.current = null;
    setTranscoding(false);
    setTranscoded(0);
    setEncoded(false);
    return ++pickId.current;
  }

  /**
   * Sizes up a picked clip, re-encodes it if it needs it, and grabs its frames —
   * all straight away, so the encode runs while the title and tags are being
   * typed and save is only an upload. A clip swapped out or removed mid-encode
   * stops it: the cost of an abandoned pick is the minutes already spent, never
   * an upload.
   *
   * The frames come from the encode rather than the original, so the preview is
   * of the bytes being published and the dimensions grabFrames records describe
   * them without a second measurement.
   */
  async function handleSelect(picked: File | null) {
    const pick = supersede();
    setFile(picked);
    setSource(picked);
    setError('');
    setAudioWarning('');
    setTranscodeNote('');
    setSprite(null);
    if (!picked) return;

    // Offer the filename as a title, but never overwrite one already typed.
    setForm((prev) => ({
      ...prev,
      title: prev.title || titleFromFilename(picked.name),
    }));

    // Read off the pick straight away, and shown as soon as it is known whether
    // the encode will fix it: a warning held back until a minutes-long encode
    // finishes reaches an admin who has already filled the form in trusting the
    // clip. Not awaited: the frames need not wait for it.
    const audioProblem = inspectAudio(picked);
    const warnAudio = () =>
      void audioProblem.then((problem) => {
        if (pickId.current === pick) setAudioWarning(problem ?? '');
      });

    // Phones do not re-encode at all, and are not even asked to size the clip up
    // — skipping the probe keeps the ~500 kB media library off a mobile
    // connection, since its only reader here is a decision already made.
    let toUpload = picked;
    if (canTranscodeHere()) {
      const plan = await inspect(picked, pick);
      if (pickId.current !== pick) return;
      // An encode that re-encodes the audio is about to fix the problem, so
      // warning now would tell the admin to run ffmpeg for nothing. Anything
      // else uploads the sound exactly as picked.
      if (!plan?.fixesAudio) warnAudio();
      if (plan) {
        try {
          toUpload = await encode(picked, plan, pick);
        } catch {
          // Only a cancellation reaches here, and only a newer pick or a Remove
          // cancels — either of which already owns the form.
          return;
        }
        if (pickId.current !== pick) return;
        setFile(toUpload);
        setSource(toUpload);
        setEncoded(toUpload !== picked);
        // The fix fell through and the original is going up, sound and all.
        if (plan.fixesAudio && toUpload === picked) warnAudio();
      }
    } else {
      warnAudio();
      setTranscodeNote(
        'Re-encoding is skipped on phones, so this uploads at its original size. Pick it from a desktop to have it compressed.',
      );
    }

    await grabFrames(toUpload);
  }

  /**
   * Reads the picked clip's shape and decides whether it needs re-encoding. Says
   * what it found either way — a clip that was already encoded by hand is the
   * common case, and with no note the check it just passed is indistinguishable
   * from a step that never ran.
   */
  async function inspect(picked: File, pick: number): Promise<TranscodePlan | null> {
    let probe;
    try {
      setInspecting(true);
      probe = await probeVideo(picked);
    } catch {
      if (pickId.current !== pick) return null;
      // A container we cannot even read the header of. generateSpriteSheet gets
      // the same file next and will produce the real error if it is truly broken.
      setTranscodeNote('Could not read that clip to size it up, so it will be uploaded as-is.');
      return null;
    } finally {
      if (pickId.current === pick) setInspecting(false);
    }
    if (pickId.current !== pick) return null;

    if (!probe.canDecode) {
      setTranscodeNote(
        'This browser cannot decode that clip, so it will be uploaded as-is. Encode it to H.264 locally first if it is a master.',
      );
      return null;
    }

    const rate = formatMbps(estimatedBitrate(picked.size, probe.durationSeconds));
    const found = `${probe.width}×${probe.height}${rate ? `, ~${rate}` : ''}`;

    const next = shouldTranscode({
      bytes: picked.size,
      durationSeconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
      audioCodec: probe.audioCodec,
      audioBitrate: probe.audioBitrate,
    });

    if (!next) {
      setTranscodeNote(`Already within target (${found}) — will upload as-is.`);
      return null;
    }

    const video = next.reencodesVideo
      ? `Re-encoding to ${next.width}×${next.height} at ~${formatMbps(next.videoBitrate)}`
      : 'Video already within target, so it is copied as-is';
    const audio = next.fixesAudio
      ? `; the audio (${probe.audioCodec ?? 'unknown codec'}) is re-encoded to AAC so browsers can play it`
      : '';
    setTranscodeNote(`${found}. ${video}${audio}.`);
    return next;
  }

  /**
   * Drops the picked clip and everything derived from it, putting the create
   * form back where it started. Nothing has reached R2 at this point. Stops a
   * running re-encode too, which makes this the encode's Cancel as well.
   *
   * Only reachable while not saving: mid-save the field withdraws this, because
   * clearing the field would not stop an upload already going.
   */
  function clearSelection() {
    supersede();
    setFile(null);
    setSource(null);
    setSprite(null);
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
   * Runs a picked clip's re-encode and returns the file to upload. Falls back to
   * the original on any failure: a clip the browser cannot re-encode is still a
   * clip worth publishing, and refusing to upload it would be a worse answer than
   * spending the bytes. A cancellation throws, so the caller can drop the pick
   * without touching a form that now belongs to the next one.
   */
  async function encode(picked: File, using: TranscodePlan, pick: number): Promise<File> {
    const current = () => pickId.current === pick;
    const controller = new AbortController();
    transcodeAbort.current = controller;
    setTranscoding(true);
    setTranscoded(0);

    try {
      const result = await transcodeVideo(picked, using, {
        signal: controller.signal,
        onProgress: (fraction) => {
          if (current()) setTranscoded(Math.round(fraction * 100));
        },
      });
      if (!current()) return picked;

      if (result === picked) {
        setTranscodeNote(
          `Kept the original — re-encoding it did not save anything (${formatMegabytes(picked.size)}).`,
        );
        return picked;
      }

      setTranscodeNote(
        `Re-encoded: ${formatMegabytes(picked.size)} → ${formatMegabytes(result.size)}.`,
      );
      return result;
    } catch (cause) {
      if (isCancellation(cause) || !current()) throw cause;
      setTranscodeNote(
        `Could not re-encode this clip (${
          cause instanceof Error ? cause.message : 'unknown error'
        }), so it will be uploaded as-is.`,
      );
      return picked;
    } finally {
      // A superseded encode leaves this alone: supersede() already reset it, and
      // the ref may by now hold the next pick's controller.
      if (current()) {
        setTranscoding(false);
        setTranscoded(0);
        transcodeAbort.current = null;
      }
    }
  }

  /**
   * Grabs the scrub preview from a local file and records everything only the
   * file itself can answer. This is the sole writer of width, height and
   * duration — nothing server-side ever opens the stored copy.
   */
  async function grabFrames(from: File, startSeconds?: number) {
    const pick = pickId.current;
    const current = () => pickId.current === pick;
    try {
      setGenerating(true);
      setGrabbed(null);
      const result = await generateSpriteSheet(from, {
        startSeconds,
        onProgress: (step) => {
          if (current()) setGrabbed(step);
        },
      });
      if (!current()) return;
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
      if (!current()) return;
      // Leaves sprite null, which keeps the save button disabled rather than
      // storing a video with no scrub preview.
      setError(
        cause instanceof Error
          ? `Could not build a preview: ${cause.message}`
          : 'Could not build a preview',
      );
    } finally {
      if (current()) {
        setGenerating(false);
        setGrabbed(null);
      }
    }
  }

  async function handleCover(picked: File | null) {
    const pick = ++coverPick.current;
    setCover(null);
    setCoverError('');
    if (!picked) return;
    setPreparingCover(true);
    try {
      const prepared = await prepareCover(picked);
      if (pick === coverPick.current) setCover(prepared);
    } catch {
      if (pick !== coverPick.current) return;
      // HEIC is the usual one: Safari decodes it, Chrome does not.
      setCoverError('Could not read that image. Try a JPEG or PNG.');
      setCoverKey((key) => key + 1);
    } finally {
      if (pick === coverPick.current) setPreparingCover(false);
    }
  }

  function clearCover() {
    coverPick.current += 1;
    setCover(null);
    setCoverError('');
    setPreparingCover(false);
    setCoverKey((key) => key + 1);
  }

  /**
   * Swaps a stored cover back for a grabbed frame. There is no frame on hand on
   * the edit page, so this grabs one — the same download Regenerate does.
   */
  function revertToFrame() {
    setDropCover(true);
    if (!sprite) void regenerate();
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

  /**
   * Saves the encode to disk. It otherwise lives only in this tab's memory until
   * save uploads it, so this is the one way to keep it — to reuse, or to not have
   * to encode again after a reload.
   */
  function downloadEncode() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFilename(file.name);
    link.click();
    // Not revoked synchronously: some browsers only begin reading the blob after
    // click() returns, and a revoked URL fails the download outright. A minute is
    // ample, and the encode is already held in state anyway.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function upload(
    blob: Blob,
    name: string,
    prefix: 'videos' | 'posters' | 'sprites' | 'covers',
  ) {
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
      // Names the poster and sprite after the clip, whether it is being uploaded
      // now or was uploaded some time ago and is only having its preview redone.
      const name = file?.name ?? (form.videoUrl ? storedName(form.videoUrl) : 'clip');
      const base = name.replace(/\.[^.]+$/, '');
      // Already the encode, if the clip needed one: that ran at pick time, and
      // `ready` holds save back until it has finished.
      if (file) videoUrl = await upload(file, file.name, 'videos');
      // A cover wins over the grabbed frame, and a stored one survives a
      // regenerate: the strip is redone, the hand-picked thumbnail is not.
      if (cover) {
        posterImageUrl = await upload(cover, encodedFilename(`${base}-cover.webp`, cover.type), 'covers');
      } else if (sprite && !keepsCover) {
        posterImageUrl = await upload(
          sprite.posterBlob,
          // Named after what the browser actually wrote — WebP, or JPEG on Safari.
          encodedFilename(`${base}-poster.webp`, sprite.posterBlob.type),
          'posters',
        );
      }
      if (sprite) {
        spriteUrl = await upload(
          sprite.spriteBlob,
          encodedFilename(`${base}-sprite.webp`, sprite.spriteBlob.type),
          'sprites',
        );
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
      setEncoded(false);
      setTranscodeNote('');
      clearCover();
      setDropCover(false);
      setResetKey((key) => key + 1);
      setError(result.error);
      setBusy(false);
      return;
    }

    if (isEdit) {
      // Back to the clip's page when that is where the edit started — see
      // lib/video/edit-link.
      router.push(returnTo);
      router.refresh();
      return;
    }

    // The create form is rendered *on* /admin/videos, so there is no navigation
    // to unmount it — reset by hand, ready for the next clip. Sort order is
    // assigned server-side; the roll is carried over, since clips tend to be
    // uploaded a roll at a time.
    setForm(buildForm({ rollId: form.rollId }));
    setFile(null);
    setSource(null);
    setSprite(null);
    setEncoded(false);
    clearCover();
    setDropCover(false);
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
        : stage === 'covers'
          ? 'Uploading thumbnail'
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
        // Not while encoding: "upload the compressed encode, not the master"
        // beside a bar that is producing exactly that encode reads as an error.
        warnAboveBytes={transcoding ? undefined : LARGE_VIDEO_BYTES}
        // Says "on desktop" rather than reading the device here: this renders
        // before anything is picked, and branching on navigator would differ
        // between the server render and the client one.
        hint="Frames are grabbed in your browser, and on desktop clips over 1080p or ~6 Mbps are re-encoded there as soon as you pick them — nothing touches a server."
        allowSelect={!isEdit}
      />

      {/* The encode runs before the frame grab and is much the longest thing
          that happens to a picked clip — minutes on a big one. A single line of
          text was too quiet for a wait that long, so this one gets a filled bar
          and a way out. Cancel drops the pick outright rather than keeping the
          original: uploading the unencoded master is the thing this guards
          against. */}
      {transcoding ? (
        <div className="rounded border border-gold/40 bg-gold/5 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-gold" aria-live="polite">
              Re-encoding for the web… {transcoded}%
            </p>
            <button
              type="button"
              onClick={clearSelection}
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
        <p className="flex items-baseline justify-between gap-3 text-xs text-ash">
          <span aria-live="polite">{transcodeNote}</span>
          {encoded && file ? (
            <button
              type="button"
              onClick={downloadEncode}
              className="shrink-0 underline underline-offset-2 hover:text-gold"
            >
              Download encode
            </button>
          ) : null}
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

      {/* After the strip rather than beside the video: it is the strip's first
          frame that this replaces, and the two are judged against each other. */}
      {hasClip ? (
        <div className="flex flex-col gap-1">
          <UploadField
            key={coverKey}
            label="Thumbnail (optional)"
            accept="image/*"
            // A grabbed frame is already shown as the strip's first cell; only a
            // cover is worth showing again here.
            value={keepsCover ? form.posterImageUrl : ''}
            file={cover}
            onSelect={handleCover}
            onClear={busy ? undefined : clearCover}
            hint="Shown until the clip is hovered, and before it plays. Without one, the first preview frame is used."
          />
          {preparingCover ? <p className="text-xs text-gold">Preparing the thumbnail…</p> : null}
          {coverError ? <p className="text-xs text-amber-400">{coverError}</p> : null}
          {keepsCover && !cover ? (
            <button
              type="button"
              onClick={revertToFrame}
              disabled={busy || fetching || generating}
              className={`${BUTTON} self-start`}
            >
              Use a frame from the clip instead
            </button>
          ) : null}
          {dropCover && !cover && !sprite ? (
            <p className="text-xs text-ash">
              The custom thumbnail goes once the frames are grabbed and you save.
            </p>
          ) : null}
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

          {rolls.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Roll</span>
              <select
                className={FIELD}
                value={form.rollId}
                onChange={(event) => set('rollId', event.target.value)}
              >
                {rolls.map((roll) => (
                  <option key={roll.id} value={roll.id}>
                    {roll.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            // A link rather than "below": this form is also the edit page, which
            // has no roll manager of its own.
            <p className="text-xs text-amber-400">
              A clip needs a roll.{' '}
              <Link href="/admin/videos#new-roll" className="underline hover:text-gold">
                Add one below the clips
              </Link>{' '}
              first.
            </p>
          )}

          <TagInput
            value={form.tags}
            onChange={(value) => set('tags', value)}
            suggestions={tagOptions}
          />

          <button type="submit" disabled={busy || !ready} className={BUTTON}>
            {busy
              ? progress !== null
                ? `${uploadLabel}… ${progress}%`
                : 'Saving…'
              : 'Save video'}
          </button>

          {!busy && !ready ? (
            <p className="text-xs text-ash">
              {transcoding
                ? `Save opens once the re-encode finishes (${transcoded}%).`
                : inspecting
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

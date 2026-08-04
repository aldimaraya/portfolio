'use client';

import { useEffect, useState } from 'react';
import { listPostMedia, type PostMediaLibrary } from '@/app/admin/posts/actions';
import { mediaSnippet, youtubeId, type MediaRef } from '@/lib/markdown/media';
import { NO_BORDER } from '@/lib/photo/border';
import { decodeImage, prepareUpload } from '@/lib/photo/trim-client';
import { uploadFile } from '@/lib/storage/upload-client';
import { BUTTON, FIELD, LABEL } from './fields';
import { UploadField } from './UploadField';

/**
 * Chooses a piece of media and hands back the Markdown for it. Four sources:
 * a new upload, the photo wall, the motion reel, and a YouTube link for
 * anything hosted elsewhere.
 *
 * Uploading happens here, on insert, rather than on save like the photo and
 * video forms do — the body has to contain the final URL to preview at all, and
 * there is no row being created that could carry a pending file.
 */

type Tab = 'upload' | 'photos' | 'videos' | 'youtube';

const TABS: { id: Tab; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
  { id: 'youtube', label: 'YouTube' },
];

/** Rough ceiling for a clip dropped into a post — the same warning the reel gives. */
const LARGE_VIDEO = 200 * 1024 * 1024;

interface Props {
  onInsert: (markdown: string) => void;
  onClose: () => void;
}

export function MediaPicker({ onInsert, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('upload');
  const [caption, setCaption] = useState('');
  const [library, setLibrary] = useState<PostMediaLibrary | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [error, setError] = useState('');

  // Loaded once, on open, rather than with the page: most edits never open this
  // panel, and it reads every row of both media tables.
  useEffect(() => {
    let cancelled = false;
    listPostMedia()
      .then((result) => {
        if (!cancelled) setLibrary(result);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the library');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function insert(media: MediaRef) {
    onInsert(mediaSnippet({ ...media, caption: caption.trim() || media.caption }));
    setCaption('');
    onClose();
  }

  /**
   * Uploads the picked file and inserts a reference to it. Images go through
   * prepareUpload with no crop, which re-encodes them through a canvas — that is
   * what strips EXIF, and a journal image has no more business publishing GPS
   * coordinates than a wall photo does.
   */
  async function handleUpload() {
    if (!file || progress !== null) return;
    setError('');
    setProgress(0);

    try {
      const isVideo = file.type.startsWith('video/');
      let upload: File | Blob = file;
      let name = file.name;

      if (!isVideo) {
        const bitmap = await decodeImage(file);
        const prepared = await prepareUpload(bitmap, NO_BORDER, file);
        bitmap.close();
        upload = prepared.file;
        name = prepared.file.name;
      }

      const url = await uploadFile(upload, name, 'journal', setProgress);
      insert({ kind: isVideo ? 'video' : 'image', url });
      setFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That upload failed');
    } finally {
      setProgress(null);
    }
  }

  function handleYoutube() {
    if (!youtubeId(youtubeUrl)) {
      setError('That is not a link to a single YouTube video');
      return;
    }
    setError('');
    insert({ kind: 'youtube', url: youtubeUrl.trim() });
    setYoutubeUrl('');
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-hairline bg-frame p-3">
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setTab(entry.id);
              setError('');
            }}
            className={`rounded border px-2 py-1 font-mono text-xs transition ${
              tab === entry.id
                ? 'border-gold text-gold'
                : 'border-hairline text-ash hover:text-bone'
            }`}
          >
            {entry.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto font-mono text-xs text-ash transition hover:text-gold"
        >
          Close
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Caption</span>
        <input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Doubles as the alt text — leave empty for none"
          className={FIELD}
        />
      </label>

      {tab === 'upload' ? (
        <div className="flex flex-col gap-2">
          <UploadField
            label="File"
            accept={file?.type.startsWith('video/') ? 'video/*' : 'image/*'}
            value=""
            file={file}
            onSelect={(picked) => {
              setFile(picked);
              setError('');
            }}
            hint="Images are re-encoded on upload, which strips their EXIF. Encode video before uploading — 1080p H.264."
            warnAboveBytes={LARGE_VIDEO}
            progress={progress}
            previewAs={file?.type.startsWith('video/') ? 'video' : 'image'}
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || progress !== null}
            className={BUTTON}
          >
            {progress !== null ? `Uploading… ${progress}%` : 'Upload and insert'}
          </button>
        </div>
      ) : null}

      {tab === 'photos' ? (
        <Grid empty="No photos yet." loading={!library}>
          {library?.photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              title={photo.location}
              onClick={() => insert({ kind: 'image', url: photo.imageUrl, caption: photo.location })}
              className="overflow-hidden rounded border border-hairline transition hover:border-gold"
            >
              {/* Plain <img>: an admin-only thumbnail grid is not worth the
                  optimiser, and these are already served from the CDN. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.imageUrl} alt={photo.location} className="h-24 w-full object-cover" />
            </button>
          ))}
        </Grid>
      ) : null}

      {tab === 'videos' ? (
        <Grid empty="No videos yet." loading={!library}>
          {library?.videos.map((video) => (
            <button
              key={video.id}
              type="button"
              title={video.title}
              onClick={() =>
                insert({
                  kind: 'video',
                  url: video.videoUrl,
                  poster: video.posterImageUrl,
                  caption: video.title,
                })
              }
              className="overflow-hidden rounded border border-hairline transition hover:border-gold"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={video.posterImageUrl} alt={video.title} className="h-24 w-full object-cover" />
            </button>
          ))}
        </Grid>
      ) : null}

      {tab === 'youtube' ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Video link</span>
            <input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://youtu.be/…"
              className={FIELD}
            />
          </label>
          <span className="text-xs text-ash">
            Embedded through youtube-nocookie, and only ever as the one video the link points at.
          </span>
          <button type="button" onClick={handleYoutube} disabled={!youtubeUrl.trim()} className={BUTTON}>
            Insert embed
          </button>
        </div>
      ) : null}

      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

function Grid({
  children,
  loading,
  empty,
}: {
  children: React.ReactNode;
  loading: boolean;
  empty: string;
}) {
  const items = Array.isArray(children) ? children : [];
  if (loading) return <span className="text-xs text-ash">Loading…</span>;
  if (items.length === 0) return <span className="text-xs text-ash">{empty}</span>;

  return (
    <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">{children}</div>
  );
}

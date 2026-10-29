import { db } from '@/lib/db';
import { takenAtToInputValue } from '@/lib/photo/date';
import { toSettings } from '@/lib/photo/settings';
import type { ClipFields, StillFields } from './drafts';

export type DraftRow =
  | { kind: 'still'; id: string; name: string; thumb: string; width: number; height: number; fields: StillFields }
  | {
      kind: 'clip';
      id: string;
      name: string;
      thumb: string;
      width: number;
      height: number;
      durationSeconds: number;
      fields: ClipFields;
    };

/** The object's own name: the nearest thing a stored draft keeps to the file it came from. */
function storedName(url: string): string {
  const last = url.split('?')[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(last) || 'Untitled';
  } catch {
    return last || 'Untitled';
  }
}

/**
 * Every draft, oldest first, shaped the way the Add media queue holds an item —
 * which is what lets finished uploads survive a refresh: the page hands these
 * back to the queue, which adopts the ones it is not already holding.
 */
export async function loadDrafts(): Promise<DraftRow[]> {
  const [stills, clips] = await Promise.all([
    db.photo.findMany({ where: { draft: true }, include: { tags: { include: { tag: true } } } }),
    db.video.findMany({ where: { draft: true }, include: { tags: { include: { tag: true } } } }),
  ]);

  const rows: { at: number; row: DraftRow }[] = [
    ...stills.map((photo) => ({
      at: photo.createdAt.getTime(),
      row: {
        kind: 'still' as const,
        id: photo.id,
        name: storedName(photo.imageUrl),
        thumb: photo.imageUrl,
        width: photo.width,
        height: photo.height,
        fields: {
          title: photo.title,
          location: photo.location,
          camera: photo.camera,
          takenAt: photo.takenAt ? takenAtToInputValue(photo.takenAt) : '',
          settings: toSettings(photo.settings),
          tags: photo.tags.map((entry) => entry.tag.name).join(', '),
        },
      },
    })),
    ...clips.map((video) => ({
      at: video.createdAt.getTime(),
      row: {
        kind: 'clip' as const,
        id: video.id,
        name: storedName(video.videoUrl),
        thumb: video.posterImageUrl,
        width: video.width,
        height: video.height,
        durationSeconds: video.durationSeconds,
        fields: {
          title: video.title,
          description: video.description,
          rollId: video.rollId ?? '',
          youtubeUrl: video.youtubeId ? `https://youtu.be/${video.youtubeId}` : '',
          tags: video.tags.map((entry) => entry.tag.name).join(', '),
        },
      },
    })),
  ];
  return rows.sort((a, b) => a.at - b.at).map(({ row }) => row);
}

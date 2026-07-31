import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { storageEnv } from '@/lib/env';

/**
 * R2 is S3-compatible, so the AWS SDK talks to it directly. Region is always
 * "auto".
 */
let client: S3Client | null = null;

export function r2(): S3Client {
  if (client) return client;
  const config = storageEnv();
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export function bucket(): string {
  return storageEnv().R2_BUCKET;
}

export type MediaPrefix = 'photos' | 'videos' | 'posters' | 'sprites';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Slugified base name plus a unique suffix, namespaced under a prefix. Uploading
 * the same filename twice must not overwrite the first copy, hence the suffix.
 */
export function buildObjectKey(filename: string, prefix: MediaPrefix | string): string {
  const dot = filename.lastIndexOf('.');
  const hasExt = dot > 0;
  const base = slugify(hasExt ? filename.slice(0, dot) : filename) || 'file';
  const ext = hasExt ? filename.slice(dot).toLowerCase() : '';
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}/${base}-${unique}${ext}`;
}

/** Joins R2_PUBLIC_BASE_URL and a key without doubling the separator. */
export function publicUrl(key: string): string {
  const base = storageEnv().R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/${key.replace(/^\/+/, '')}`;
}

/**
 * Inverse of publicUrl. Returns null for anything that is not an object in our
 * own bucket, so a hand-edited row pointing at some other host can never turn
 * into a delete against a key we did not mean.
 */
export function objectKeyFromUrl(url: string, baseUrl: string): string | null {
  const base = baseUrl.replace(/\/+$/, '');
  if (!url.startsWith(`${base}/`)) return null;

  const key = url.slice(base.length + 1).split(/[?#]/)[0];
  if (!key) return null;

  try {
    return decodeURIComponent(key);
  } catch {
    // A malformed escape sequence — better to skip than to guess at a key.
    return null;
  }
}

export interface DeleteReport {
  deleted: string[];
  /** URLs that were not ours to delete, left untouched. */
  skipped: string[];
}

/**
 * Removes objects by their public URL. Deleting a key that is already gone is not
 * an error in S3, so this is safe to retry — which is what lets callers delete
 * from R2 *before* dropping the database row that points at it.
 */
export async function deleteObjectsByUrl(urls: string[]): Promise<DeleteReport> {
  const base = storageEnv().R2_PUBLIC_BASE_URL;
  const deleted: string[] = [];
  const skipped: string[] = [];

  for (const url of urls) {
    if (!url) continue;
    const key = objectKeyFromUrl(url, base);
    if (key) deleted.push(key);
    else skipped.push(url);
  }

  if (deleted.length) {
    await r2().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: deleted.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  return { deleted, skipped };
}

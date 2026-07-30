import { S3Client } from '@aws-sdk/client-s3';
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

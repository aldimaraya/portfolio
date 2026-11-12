/**
 * Makes the tray thumbnail for every journal photo uploaded before thumbnails
 * existed.
 *
 *   npm run backfill:thumbs            # dry run — reports, writes nothing
 *   npm run backfill:thumbs -- --apply # uploads the thumbnails and records them
 *
 * Until a row has one, the editor's tray draws the full 2560px copy, which is
 * what made a trip's tray crawl on a slow connection. Additive only: each
 * thumbnail is a new object beside its photo and only `thumbUrl` is written, so
 * a bad run is undone by clearing that column.
 *
 * Mirrors THUMB_EDGE and THUMB_QUALITY in src/lib/photo/compress.ts — sharp here
 * against a canvas there, so a duplicated constant rather than a shared encoder.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd(), true);

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const sharp = require('sharp');

/** Keep in step with src/lib/photo/compress.ts. */
const THUMB_EDGE = 480;
const THUMB_QUALITY = 72;

const apply = process.argv.includes('--apply');

// The Neon serverless driver needs a global WebSocket, which Node gained in 22.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
  console.error(`✗ Node ${process.versions.node} is too old — this needs Node 22+ (nvm use 22).`);
  process.exit(1);
}

for (const key of ['DATABASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL']) {
  if (!process.env[key]) {
    console.error(`✗ ${key} is not set — run npm run check:r2 first.`);
    process.exit(1);
  }
}

const publicBase = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

/** The object key for a stored public URL, or null if it is not ours. */
function keyFor(url) {
  if (!url.startsWith(`${publicBase}/`)) return null;
  return decodeURIComponent(url.slice(publicBase.length + 1));
}

const photos = await db.journalPhoto.findMany({
  where: { thumbUrl: null },
  select: { id: true, imageUrl: true },
  orderBy: { createdAt: 'asc' },
});

console.log(`${photos.length} journal photo${photos.length === 1 ? '' : 's'} without a thumbnail`);
console.log(apply ? 'Mode: APPLY — will upload and update records\n' : 'Mode: dry run — nothing will be written\n');

let made = 0;
let failed = 0;
let bytesBefore = 0;
let bytesAfter = 0;

for (const photo of photos) {
  const key = keyFor(photo.imageUrl);
  const label = key ?? photo.imageUrl;

  // Under journal/ like the photo, which is what addJournalPhoto accepts for a
  // thumbnail and what deleteJournalPhotos cleans up alongside it.
  if (!key?.startsWith('journal/')) {
    console.log(`— ${label}: not a journal object, skipping`);
    continue;
  }

  try {
    const response = await fetch(photo.imageUrl);
    if (!response.ok) {
      console.log(`✗ ${label}: fetch failed with ${response.status}`);
      failed += 1;
      continue;
    }
    const original = Buffer.from(await response.arrayBuffer());

    // `rotate()` applies EXIF orientation, matching the browser's
    // imageOrientation: 'from-image'. The stored copies carry none, but a file
    // kept verbatim (keepsOriginal) might.
    const { data } = await sharp(original)
      .rotate()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer({ resolveWithObject: true });

    const thumbKey = `${key.replace(/\.[^./]+$/, '')}-thumb.webp`;
    bytesBefore += original.byteLength;
    bytesAfter += data.byteLength;
    console.log(`${apply ? '✓' : '·'} ${label}: ${Math.round(original.byteLength / 1024)} KB → ${Math.round(data.byteLength / 1024)} KB`);

    if (apply) {
      await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: thumbKey, Body: data, ContentType: 'image/webp' }));
      // Only once the object is in the bucket: a thumbUrl pointing nowhere is a
      // blank cell in the tray, where a missing one falls back to the photo.
      await db.journalPhoto.update({ where: { id: photo.id }, data: { thumbUrl: `${publicBase}/${thumbKey}` } });
    }
    made += 1;
  } catch (error) {
    console.log(`✗ ${label}: ${error.message}`);
    failed += 1;
  }
}

console.log('');
console.log(`thumbnails ${made} · failed ${failed}`);
if (made) console.log(`tray weight ${Math.round(bytesBefore / 1024 / 1024)} MB → ${Math.round(bytesAfter / 1024 / 1024)} MB`);
if (!apply && made) console.log('\nThis was a dry run. Re-run with --apply to write the changes.');

await db.$disconnect();

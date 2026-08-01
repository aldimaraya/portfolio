/**
 * Re-encodes photos already in R2 to the same web-sized WebP that new uploads
 * now get, and repoints their records at the result.
 *
 *   npm run backfill:photos            # dry run — reports, writes nothing
 *   npm run backfill:photos -- --apply # actually uploads and updates the DB
 *
 * Originals are never overwritten or deleted: each photo is written to a new key
 * and the record repointed, so a bad run is undone by restoring imageUrl. The
 * orphaned originals are listed at the end for you to delete once you are happy.
 *
 * Mirrors src/lib/photo/compress.ts — MAX_EDGE and QUALITY are duplicated here
 * because that module is browser-only (canvas), and this one is sharp.
 */
import { createRequire } from 'node:module';
import { basename } from 'node:path';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd(), true);

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const sharp = require('sharp');

/** Keep in step with src/lib/photo/compress.ts. */
const MAX_EDGE = 2560;
const QUALITY = 85;

/** Below this, re-encoding is not worth a new object and a DB write. */
const SKIP_BELOW_BYTES = 1024 * 1024;

const apply = process.argv.includes('--apply');

// The Neon serverless driver needs a global WebSocket, which Node gained in 22.
// Without this the failure is a stack trace out of the driver that reads like a
// network problem rather than a version one.
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

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The object key for a stored public URL, or null if it is not ours. */
function keyFor(imageUrl) {
  if (!imageUrl.startsWith(`${publicBase}/`)) return null;
  return decodeURIComponent(imageUrl.slice(publicBase.length + 1));
}

/** A sibling key with a .webp extension, suffixed so it never clobbers the original. */
function webpKeyFor(key) {
  return `${key.replace(/\.[^./]+$/, '')}-web.webp`;
}

const photos = await db.photo.findMany({
  select: { id: true, imageUrl: true, width: true, height: true, location: true },
  orderBy: { createdAt: 'asc' },
});

console.log(`${photos.length} photo${photos.length === 1 ? '' : 's'} in the database`);
console.log(apply ? 'Mode: APPLY — will upload and update records\n' : 'Mode: dry run — nothing will be written\n');

let converted = 0;
let skipped = 0;
let failed = 0;
let bytesBefore = 0;
let bytesAfter = 0;
const orphans = [];

for (const photo of photos) {
  const label = `${photo.location || photo.id}`;
  const key = keyFor(photo.imageUrl);

  if (!key) {
    console.log(`— ${label}: not an R2 URL, skipping (${photo.imageUrl})`);
    skipped += 1;
    continue;
  }

  try {
    // Fetched over the public URL rather than GetObject: it is the same bytes,
    // and it doubles as a check that the object is actually reachable the way
    // the site loads it.
    const response = await fetch(photo.imageUrl);
    if (!response.ok) {
      console.log(`✗ ${label}: fetch failed with ${response.status}`);
      failed += 1;
      continue;
    }
    const original = Buffer.from(await response.arrayBuffer());

    if (original.byteLength < SKIP_BELOW_BYTES) {
      console.log(`— ${label}: already ${mb(original.byteLength)}, skipping`);
      skipped += 1;
      continue;
    }

    // `rotate()` with no argument applies the EXIF orientation, matching the
    // browser's imageOrientation: 'from-image' — without it, portrait shots come
    // back sideways and their stored dimensions would be wrong.
    const encoded = await sharp(original)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });

    const { data, info } = encoded;

    if (data.byteLength >= original.byteLength) {
      console.log(`— ${label}: re-encode is no smaller (${mb(data.byteLength)}), skipping`);
      skipped += 1;
      continue;
    }

    const newKey = webpKeyFor(key);
    const newUrl = `${publicBase}/${newKey}`;

    bytesBefore += original.byteLength;
    bytesAfter += data.byteLength;

    console.log(
      `${apply ? '✓' : '·'} ${label}: ${mb(original.byteLength)} → ${mb(data.byteLength)}` +
        ` · ${photo.width}×${photo.height} → ${info.width}×${info.height}`,
    );

    if (apply) {
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: newKey,
          Body: data,
          ContentType: 'image/webp',
        }),
      );
      // Only after the object is safely in the bucket — a record pointing at a
      // key that failed to upload would be a broken photo on the wall.
      await db.photo.update({
        where: { id: photo.id },
        data: { imageUrl: newUrl, width: info.width, height: info.height },
      });
    }

    orphans.push(key);
    converted += 1;
  } catch (error) {
    console.log(`✗ ${label}: ${error.message}`);
    failed += 1;
  }
}

console.log('');
console.log(`converted ${converted} · skipped ${skipped} · failed ${failed}`);
if (converted) {
  const saved = bytesBefore - bytesAfter;
  const percent = Math.round((saved / bytesBefore) * 100);
  console.log(`${mb(bytesBefore)} → ${mb(bytesAfter)} (${percent}% smaller)`);
}

if (!apply && converted) {
  console.log('\nThis was a dry run. Re-run with --apply to write the changes.');
}

if (apply && orphans.length) {
  console.log(`\n${orphans.length} original object${orphans.length === 1 ? '' : 's'} left in the bucket, no longer referenced:`);
  for (const key of orphans) console.log(`  ${basename(key)}`);
  console.log('Delete them once the wall looks right — they are your only full-resolution copies.');
}

await db.$disconnect();

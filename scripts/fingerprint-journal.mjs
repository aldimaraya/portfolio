/**
 * Fingerprints every journal photo uploaded before the duplicate check existed.
 *
 *   npm run backfill:fingerprints            # dry run — reports, writes nothing
 *   npm run backfill:fingerprints -- --apply # actually updates the DB
 *
 * Until a row has a fingerprint, the tray cannot match a new upload against it,
 * so re-uploading one of these photos goes through unnoticed. Read-only against
 * the bucket: the stored copy is the input, and only the `fingerprint` column is
 * written, so a bad run costs another run rather than a restore.
 *
 * Imports the real hash from src/ for the reason recolor-photos.mjs does: a copy
 * here would drift, and a backfilled fingerprint that the browser would compute
 * differently is a duplicate the check silently misses.
 *
 * The dry run also lists pairs within a post that already look alike — either
 * a duplicate that is already there, or a burst the margin is too loose for.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd(), true);

const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const sharp = require('sharp');

const { fingerprintPixels, fingerprintDistance, DUPLICATE_DISTANCE } = await import(
  '../src/lib/photo/fingerprint.ts'
);

/**
 * Keep in step with SAMPLE_WIDTH in src/lib/photo/trim-client.ts — the browser
 * fingerprints the 100px-wide sample it draws for colour analysis.
 */
const SAMPLE_WIDTH = 100;

const apply = process.argv.includes('--apply');

// The Neon serverless driver needs a global WebSocket, which Node gained in 22.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
  console.error(`✗ Node ${process.versions.node} is too old — this needs Node 22+ (nvm use 22).`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.');
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const photos = await db.journalPhoto.findMany({
  where: { fingerprint: null },
  select: { id: true, postId: true, imageUrl: true },
  orderBy: { createdAt: 'asc' },
});

console.log(`${photos.length} journal photo${photos.length === 1 ? '' : 's'} without a fingerprint`);
console.log(apply ? 'Mode: APPLY — will update records\n' : 'Mode: dry run — nothing will be written\n');

let updated = 0;
let failed = 0;
const byPost = new Map();

for (const photo of photos) {
  const label = photo.imageUrl.split('/').pop();

  try {
    const response = await fetch(photo.imageUrl);
    if (!response.ok) {
      console.log(`✗ ${label}: fetch failed with ${response.status}`);
      failed += 1;
      continue;
    }

    // `rotate()` applies EXIF orientation, matching the browser's
    // imageOrientation: 'from-image' — unlike colour stats, a hash of
    // left-right gradients does care which way up the frame is.
    const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize({ width: SAMPLE_WIDTH, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const fingerprint = fingerprintPixels(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
      info.width,
      info.height,
    );
    if (!fingerprint) {
      console.log(`✗ ${label}: could not be fingerprinted`);
      failed += 1;
      continue;
    }

    console.log(`${apply ? '✓' : '·'} ${label}: ${fingerprint}`);
    if (!byPost.has(photo.postId)) byPost.set(photo.postId, []);
    byPost.get(photo.postId).push({ label, fingerprint });

    if (apply) {
      await db.journalPhoto.update({ where: { id: photo.id }, data: { fingerprint } });
    }
    updated += 1;
  } catch (error) {
    console.log(`✗ ${label}: ${error.message}`);
    failed += 1;
  }
}

console.log('');
console.log(`fingerprinted ${updated} · failed ${failed}`);

const alike = [];
for (const list of byPost.values()) {
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const distance = fingerprintDistance(list[i].fingerprint, list[j].fingerprint);
      if (distance <= DUPLICATE_DISTANCE) alike.push(`${list[i].label} ≈ ${list[j].label} (${distance} bits)`);
    }
  }
}
if (alike.length) {
  console.log(`\n${alike.length} pair${alike.length === 1 ? '' : 's'} in the same post already look alike:`);
  for (const line of alike) console.log(`  ${line}`);
}

if (!apply && updated) {
  console.log('\nThis was a dry run. Re-run with --apply to write the changes.');
}

await db.$disconnect();

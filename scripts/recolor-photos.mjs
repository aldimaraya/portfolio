/**
 * Recomputes the colour stats on every photo with the OKLab analyser.
 *
 *   npm run recolor:photos            # dry run — reports, writes nothing
 *   npm run recolor:photos -- --apply # actually updates the DB
 *
 * Rows written before OKLab analysis have no `warmth` at all, so until this runs
 * they default to 0 and the wall files them all as perfectly neutral. Nothing is
 * uploaded or deleted here — the stored image is the input, and only the stat
 * columns change, so a bad run costs another run rather than a restore.
 *
 * Unlike backfill-photos.mjs, this imports the real analyser from src/ rather
 * than duplicating it: lib/color/analyze.ts is pure arithmetic with no canvas in
 * it, and Node strips the types on import. Duplicating it would guarantee that
 * the wall and the backfill drift apart.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd(), true);

const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const sharp = require('sharp');

const { analyzePixels } = await import('../src/lib/color/analyze.ts');

/**
 * Keep in step with SAMPLE_WIDTH in src/lib/photo/trim-client.ts. The browser
 * analyses a 100px-wide copy; matching that here means a re-analysed photo lands
 * on the same numbers it would if it were uploaded again today.
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

/** Which band of the wall these stats put a photo in — the thing worth eyeballing. */
function band(stats) {
  return stats.isMonochrome ? 'mono' : 'colour';
}

const photos = await db.photo.findMany({
  select: {
    id: true,
    imageUrl: true,
    location: true,
    avgHue: true,
    avgLightness: true,
    warmth: true,
    isMonochrome: true,
  },
  orderBy: { createdAt: 'asc' },
});

console.log(`${photos.length} photo${photos.length === 1 ? '' : 's'} in the database`);
console.log(apply ? 'Mode: APPLY — will update records\n' : 'Mode: dry run — nothing will be written\n');

let updated = 0;
let failed = 0;
const moved = [];

for (const photo of photos) {
  const label = photo.location || photo.id;

  try {
    const response = await fetch(photo.imageUrl);
    if (!response.ok) {
      console.log(`✗ ${label}: fetch failed with ${response.status}`);
      failed += 1;
      continue;
    }

    // `rotate()` applies EXIF orientation, matching the browser's
    // imageOrientation: 'from-image'. Colour stats do not care which way up the
    // frame is, but the sampled pixels should still be the ones the site shows.
    const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize({ width: SAMPLE_WIDTH, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 4) {
      console.log(`✗ ${label}: expected RGBA, got ${info.channels} channels`);
      failed += 1;
      continue;
    }

    const stats = analyzePixels(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length));
    const before = band(photo);
    const after = band(stats);

    console.log(
      `${apply ? '✓' : '·'} ${label}: warmth ${photo.warmth.toFixed(4)} → ${stats.warmth.toFixed(4)}` +
        ` · ${before}${before === after ? '' : ` → ${after}`}`,
    );
    if (before !== after) moved.push(`${label}: ${before} → ${after}`);

    if (apply) {
      await db.photo.update({
        where: { id: photo.id },
        data: {
          avgHue: stats.avgHue,
          avgChroma: stats.avgChroma,
          avgLightness: stats.avgLightness,
          warmth: stats.warmth,
          isMonochrome: stats.isMonochrome,
        },
      });
    }

    updated += 1;
  } catch (error) {
    console.log(`✗ ${label}: ${error.message}`);
    failed += 1;
  }
}

console.log('');
console.log(`analysed ${updated} · failed ${failed}`);

// The reclassifications are the whole point of the dry run: a photo you think of
// as black-and-white landing in the colour sweep means the threshold is wrong.
if (moved.length) {
  console.log(`\n${moved.length} photo${moved.length === 1 ? '' : 's'} changed band:`);
  for (const line of moved) console.log(`  ${line}`);
}

if (!apply && updated) {
  console.log('\nThis was a dry run. Re-run with --apply to write the changes.');
}

await db.$disconnect();

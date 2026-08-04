/**
 * Fills in Video.durationSeconds for clips uploaded before the column existed.
 *
 *   npm run backfill:durations            # dry run — reports, writes nothing
 *   npm run backfill:durations -- --apply # actually updates the DB
 *
 * Every clip uploaded from now on carries its duration from the browser, read
 * off the picked file at the same moment as the sprite sheet. This is only for
 * the ones that predate that, and it is the one place anything server-side looks
 * inside a stored video.
 *
 * It stays within the pipeline's rule anyway: no frame is decoded and the file
 * is never downloaded. It walks the MP4 box structure over HTTP range requests —
 * a few 16-byte reads to find `moov`, then that one box — so a 900MB clip costs
 * kilobytes. The parsing itself lives in src/lib/video/mp4.ts, under test.
 *
 * Only the duration column is written, and only where it is currently 0, so a
 * bad run costs another run rather than a restore.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd(), true);

const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const { readBoxHeader, readDurationFromMoov } = await import('../src/lib/video/mp4.ts');
const { formatDuration } = await import('../src/lib/video/duration.ts');

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

/** Reads a byte range from the stored clip. */
async function readRange(url, start, length) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${start + length - 1}` },
  });
  // 206 is the answer we want. A 200 means the server ignored the Range and is
  // sending the whole clip, which is exactly what this script exists not to do.
  if (response.status !== 206) {
    throw new Error(
      response.ok
        ? `the CDN ignored the range request (${response.status})`
        : `fetch failed with ${response.status}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Walks the file's top-level boxes to find `moov`, then reads it whole.
 *
 * The walk matters: an unoptimised export leaves `moov` after the media data, so
 * the first megabyte of the file contains nothing useful. Stepping box by box
 * finds it wherever it is, for the cost of one small read per box.
 */
async function fetchDuration(url) {
  let offset = 0;

  // A guard against a malformed file turning this into an endless walk. No sane
  // container has anywhere near this many top-level boxes.
  for (let step = 0; step < 64; step += 1) {
    const header = readBoxHeader(await readRange(url, offset, 16));
    if (!header) return null;

    if (header.type === 'moov') {
      // Capped: a moov large enough to exceed this is carrying something other
      // than the header we came for, and is not worth pulling down blind.
      if (header.size > 8_000_000) throw new Error(`moov is ${header.size} bytes — skipped`);
      return readDurationFromMoov(await readRange(url, offset, header.size));
    }

    // A size of 0 means "to the end of the file", so there is nothing after it.
    if (header.size <= 0) return null;
    offset += header.size;
  }

  return null;
}

const videos = await db.video.findMany({
  select: { id: true, title: true, videoUrl: true, durationSeconds: true },
  orderBy: { sortOrder: 'asc' },
});

const pending = videos.filter((video) => !video.durationSeconds);

console.log(`${videos.length} clip${videos.length === 1 ? '' : 's'} in the database`);
console.log(`${pending.length} without a duration`);
console.log(apply ? 'Mode: APPLY — will update records\n' : 'Mode: dry run — nothing will be written\n');

let updated = 0;
let failed = 0;

for (const video of pending) {
  const label = video.title || video.id;

  try {
    const seconds = await fetchDuration(video.videoUrl);
    if (!seconds) {
      console.log(`✗ ${label}: no duration found in the file`);
      failed += 1;
      continue;
    }

    console.log(`${apply ? '✓' : '·'} ${label}: ${formatDuration(seconds)} (${seconds.toFixed(2)}s)`);

    if (apply) {
      await db.video.update({ where: { id: video.id }, data: { durationSeconds: seconds } });
    }
    updated += 1;
  } catch (cause) {
    console.log(`✗ ${label}: ${cause instanceof Error ? cause.message : cause}`);
    failed += 1;
  }
}

console.log(
  `\n${apply ? 'Updated' : 'Would update'} ${updated} clip${updated === 1 ? '' : 's'}` +
    (failed ? `, ${failed} could not be read` : ''),
);
if (!apply && updated) console.log('Re-run with --apply to write these.');

await db.$disconnect();

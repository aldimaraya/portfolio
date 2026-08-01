/**
 * Tidies the camera settings already stored on photos the way new uploads are
 * now prefilled: drops the built-in phone module masquerading as a lens, and
 * rounds a raw sensor aperture to the marked f-stop.
 *
 *   npm run backfill:settings            # dry run — reports, writes nothing
 *   npm run backfill:settings -- --apply # actually updates the records
 *
 * Only these two fields are touched, and only when they still look like the raw
 * EXIF that produced them. Anything hand-typed in the admin — a lens you named
 * yourself, an aperture already written as f/2.8 — is left exactly as it is.
 *
 * Mirrors the rules in src/lib/photo/exif.ts and src/lib/photo/settings.ts; they
 * are duplicated here because those modules are TypeScript and this is plain
 * Node. If you change one, change the other.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd(), true);

const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const apply = process.argv.includes('--apply');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
  console.error(`✗ Node ${process.versions.node} is too old — this needs Node 22+ (nvm use 22).`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.');
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

/** Keep in step with isBuiltInPhoneModule in src/lib/photo/exif.ts. */
function isBuiltInPhoneModule(lens) {
  return /\b(back|front)\b.*\bcamera\b/i.test(lens);
}

/**
 * "f/2.798828125" → "f/2.8". Returns the value untouched unless it is exactly an
 * f-number with more precision than a photographer would write — a lens named in
 * the field ("f/1.4 Summilux") or an already-short stop is left alone.
 */
function roundAperture(aperture) {
  const match = /^f\/(\d+(?:\.\d+)?)$/i.exec(aperture.trim());
  if (!match) return aperture;
  const rounded = `f/${Number(Number(match[1]).toFixed(1))}`;
  return rounded === aperture ? aperture : rounded;
}

const photos = await db.photo.findMany({
  select: { id: true, location: true, settings: true },
  orderBy: { createdAt: 'asc' },
});

console.log(`${photos.length} photo${photos.length === 1 ? '' : 's'} in the database`);
console.log(apply ? 'Mode: APPLY — will update records\n' : 'Mode: dry run — nothing will be written\n');

let updated = 0;
let unchanged = 0;

for (const photo of photos) {
  const label = photo.location || photo.id;
  const settings = photo.settings;

  // An old or hand-edited row may hold anything at all in this JSON column; the
  // app tolerates that by falling back to blanks, so this does too.
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    unchanged += 1;
    continue;
  }

  const changes = [];
  const next = { ...settings };

  if (typeof next.lens === 'string' && next.lens !== '' && isBuiltInPhoneModule(next.lens)) {
    changes.push(`lens "${next.lens}" → dropped`);
    next.lens = '';
  }

  if (typeof next.aperture === 'string' && next.aperture !== '') {
    const rounded = roundAperture(next.aperture);
    if (rounded !== next.aperture) {
      changes.push(`aperture ${next.aperture} → ${rounded}`);
      next.aperture = rounded;
    }
  }

  if (changes.length === 0) {
    unchanged += 1;
    continue;
  }

  console.log(`${apply ? '✓' : '·'} ${label}: ${changes.join(' · ')}`);

  if (apply) {
    await db.photo.update({ where: { id: photo.id }, data: { settings: next } });
  }

  updated += 1;
}

console.log('');
console.log(`updated ${updated} · unchanged ${unchanged}`);

if (!apply && updated) {
  console.log('\nThis was a dry run. Re-run with --apply to write the changes.');
}

await db.$disconnect();

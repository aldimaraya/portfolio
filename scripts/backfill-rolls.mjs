/**
 * Files every clip that predates rolls onto one.
 *
 *   npm run backfill:rolls                          # dry run — reports, writes nothing
 *   npm run backfill:rolls -- --apply               # files them on a roll named "Films"
 *   npm run backfill:rolls -- --apply --name Travel # …or one named something else
 *
 * If a roll already exists, clips go onto the first one and --name is ignored —
 * the same roll /motion has been showing them on in the meantime (see
 * groupIntoRolls), so running this changes nothing a visitor can see. Otherwise
 * one roll is created to hold them.
 *
 * Only rollId is written, and only where it is null, so each clip keeps its
 * sortOrder — the old single roll's order carries straight over — and a second
 * run finds nothing to do.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd(), true);

const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const apply = process.argv.includes('--apply');
const nameAt = process.argv.indexOf('--name');
const name = (nameAt === -1 ? 'Films' : (process.argv[nameAt + 1] ?? '')).trim();

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

if (!name) {
  console.error('✗ --name needs a value.');
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const unfiled = await db.video.findMany({
  where: { rollId: null },
  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  select: { id: true, title: true },
});
const first = await db.roll.findFirst({
  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  select: { id: true, name: true },
});

console.log(`${unfiled.length} clip${unfiled.length === 1 ? '' : 's'} not on a roll`);
console.log(apply ? 'Mode: APPLY — will update records\n' : 'Mode: dry run — nothing will be written\n');

if (unfiled.length === 0) {
  console.log('Nothing to do.');
  await db.$disconnect();
  process.exit(0);
}

console.log(first ? `Target: existing roll "${first.name}"` : `Target: new roll "${name}"`);
for (const video of unfiled) console.log(`  · ${video.title || video.id}`);

if (apply) {
  // One transaction, so a failure cannot leave a new, half-filled roll behind.
  await db.$transaction(async (tx) => {
    const roll = first ?? (await tx.roll.create({ data: { name, sortOrder: 0 } }));
    await tx.video.updateMany({ where: { rollId: null }, data: { rollId: roll.id } });
  });
  console.log(`\n✓ Filed ${unfiled.length} clip${unfiled.length === 1 ? '' : 's'}.`);
} else {
  console.log('\nRe-run with --apply to write this.');
}

await db.$disconnect();

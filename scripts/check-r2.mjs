/**
 * Verifies the R2 configuration in .env without printing any secrets.
 *
 *   npm run check:r2
 *
 * Deliberately uses @next/env — the same loader the app uses — so this reports
 * what Next actually sees, including any $-expansion surprises.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

loadEnvConfig(process.cwd(), true);

const required = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
];

let ok = true;

for (const key of required) {
  const value = process.env[key] ?? '';
  if (!value) {
    console.log(`✗ ${key.padEnd(22)} missing or empty`);
    ok = false;
    continue;
  }
  // A stray backslash means a \$ escape was read literally by the wrong loader.
  const suspect = value.includes('\\$') ? '  ⚠ contains a literal \\$' : '';
  console.log(`✓ ${key.padEnd(22)} set (${value.length} chars)${suspect}`);
}

if (!ok) {
  console.log('\nFill the missing values in .env, then re-run.');
  process.exit(1);
}

try {
  new URL(process.env.R2_PUBLIC_BASE_URL);
} catch {
  console.log('\n✗ R2_PUBLIC_BASE_URL is not a valid URL');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

console.log('\nConnecting to R2…');

try {
  // Read-only: proves the credentials, the bucket name, and the token's scope
  // without writing anything into your bucket.
  const result = await client.send(
    new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, MaxKeys: 1 }),
  );
  console.log(`✓ Reached bucket "${process.env.R2_BUCKET}"`);
  console.log(`  objects present: ${result.KeyCount ?? 0}`);
  console.log('\nR2 is configured correctly.');
  console.log('Note: this cannot verify your CORS policy — only a real browser upload can.');
} catch (error) {
  console.log(`✗ ${error.name}: ${error.message}`);
  const hints = {
    InvalidAccessKeyId: 'Access key is wrong, or the token was revoked.',
    SignatureDoesNotMatch: 'Secret key is wrong — check for a truncated paste.',
    NoSuchBucket: 'Bucket name does not match, or the token is scoped elsewhere.',
    AccessDenied: 'Token lacks Object Read & Write, or is scoped to another bucket.',
  };
  if (hints[error.name]) console.log(`  → ${hints[error.name]}`);
  process.exit(1);
}

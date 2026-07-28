import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/lib/env';

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgresql://u:p@h/d',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket',
      R2_PUBLIC_BASE_URL: 'https://media.example.com',
      ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
      SESSION_SECRET: 'a'.repeat(32),
    });
    expect(result.R2_BUCKET).toBe('bucket');
  });

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://u:p@h/d',
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
        R2_PUBLIC_BASE_URL: 'https://media.example.com',
        ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
        SESSION_SECRET: 'tooshort',
      }),
    ).toThrow();
  });

  it('rejects a non-URL public media base', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://u:p@h/d',
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
        R2_PUBLIC_BASE_URL: 'not-a-url',
        ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
        SESSION_SECRET: 'a'.repeat(32),
      }),
    ).toThrow();
  });
});

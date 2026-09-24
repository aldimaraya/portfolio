import { describe, it, expect } from 'vitest';
import { parseEmailEnv, parseEnv } from '@/lib/env';

const complete = {
  DATABASE_URL: 'postgresql://u:p@h/d',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  R2_PUBLIC_BASE_URL: 'https://media.example.com',
  ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    expect(parseEnv(complete).R2_BUCKET).toBe('bucket');
  });

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() => parseEnv({ ...complete, SESSION_SECRET: 'tooshort' })).toThrow();
  });

  it('rejects a non-URL public media base', () => {
    expect(() => parseEnv({ ...complete, R2_PUBLIC_BASE_URL: 'not-a-url' })).toThrow();
  });
});

describe('parseEmailEnv', () => {
  it('needs both the key and the sender', () => {
    expect(() => parseEmailEnv({ RESEND_API_KEY: 're_x' })).toThrow();
    expect(parseEmailEnv({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'A <a@b.co>' }).EMAIL_FROM).toBe('A <a@b.co>');
  });

  it('is not part of the full check, so a site without email still validates', () => {
    expect(parseEnv(complete).DATABASE_URL).toBeTruthy();
  });
});

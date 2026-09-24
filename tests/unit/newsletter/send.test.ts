import { describe, it, expect } from 'vitest';
import { batchKey, emailConfigured, isProductionDeployment, mayEmail, testRecipients } from '@/lib/newsletter/send';

describe('mayEmail', () => {
  it('allows anyone from the production deployment', () => {
    expect(mayEmail('someone@example.com', { VERCEL_ENV: 'production' })).toBe(true);
  });

  it('allows only the test addresses anywhere else', () => {
    const env = { VERCEL_ENV: 'preview', NEWSLETTER_TEST_EMAIL: 'Me@Example.com, other@x.io' };
    expect(mayEmail('me@example.com', env)).toBe(true);
    expect(mayEmail('other@x.io', env)).toBe(true);
    expect(mayEmail('subscriber@example.com', env)).toBe(false);
  });

  it('allows nobody locally when no test address is set', () => {
    expect(mayEmail('me@example.com', {})).toBe(false);
  });
});

describe('isProductionDeployment', () => {
  it('reads Vercel’s environment, not NODE_ENV', () => {
    // A preview build runs with NODE_ENV=production too.
    expect(isProductionDeployment({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(false);
  });
});

describe('testRecipients', () => {
  it('ignores blanks', () => {
    expect(testRecipients({ NEWSLETTER_TEST_EMAIL: ' , a@b.co,' })).toEqual(['a@b.co']);
  });
});

describe('emailConfigured', () => {
  it('needs both the key and the sender', () => {
    expect(emailConfigured({ RESEND_API_KEY: 're_x' })).toBe(false);
    expect(emailConfigured({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'A <a@b.co>' })).toBe(true);
  });
});

describe('batchKey', () => {
  it('is stable for the same recipients, so a retry is deduplicated', () => {
    expect(batchKey('d1', ['a@x.io', 'b@x.io'])).toBe(batchKey('d1', ['a@x.io', 'b@x.io']));
  });

  it('differs for a different set', () => {
    expect(batchKey('d1', ['a@x.io'])).not.toBe(batchKey('d1', ['b@x.io']));
  });

  it('fits Resend’s 256-character limit', () => {
    expect(batchKey(`dispatch-${'x'.repeat(36)}`, ['a@x.io']).length).toBeLessThanOrEqual(256);
  });
});

import { describe, it, expect } from 'vitest';
import { manageUrl, newToken, unsubscribeHeaders } from '@/lib/newsletter/links';

describe('newToken', () => {
  it('is URL-safe and unguessably long', () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newToken()).not.toBe(token);
  });
});

describe('links', () => {
  it('encodes the token', () => {
    expect(manageUrl('https://idlabs.me', 'a+b')).toBe('https://idlabs.me/newsletter/manage?token=a%2Bb');
  });

  it('declares RFC 8058 one-click unsubscribe', () => {
    const headers = unsubscribeHeaders('https://idlabs.me', 't');
    expect(headers['List-Unsubscribe']).toBe('<https://idlabs.me/api/newsletter/unsubscribe?token=t>');
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

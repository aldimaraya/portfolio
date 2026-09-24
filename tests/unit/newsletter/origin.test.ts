import { describe, it, expect } from 'vitest';
import { originFromHeaders } from '@/lib/newsletter/origin';

describe('originFromHeaders', () => {
  it('uses plain http for the local dev server', () => {
    expect(originFromHeaders(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });

  it('assumes https for anything else', () => {
    expect(originFromHeaders(new Headers({ host: 'x.vercel.app' }))).toBe('https://x.vercel.app');
  });

  it('prefers the forwarded host and protocol', () => {
    const forwarded = new Headers({
      host: 'internal:8080',
      'x-forwarded-host': 'preview.example.com',
      'x-forwarded-proto': 'https',
    });
    expect(originFromHeaders(forwarded)).toBe('https://preview.example.com');
  });

  it('gives up without a host', () => {
    expect(originFromHeaders(new Headers())).toBeNull();
  });
});

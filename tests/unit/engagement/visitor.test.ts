import { describe, it, expect } from 'vitest';
import {
  hashVisitor,
  isBot,
  isVisitorId,
  newVisitorId,
  utcDay,
  viewerHash,
} from '@/lib/engagement/visitor';

const SECRET = 'a'.repeat(32);
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

describe('visitor ids', () => {
  it('issues ids the cookie check accepts, and different ones each time', () => {
    const id = newVisitorId();
    expect(isVisitorId(id)).toBe(true);
    expect(newVisitorId()).not.toBe(id);
  });

  it('rejects anything this site could not have issued', () => {
    expect(isVisitorId(undefined)).toBe(false);
    expect(isVisitorId('')).toBe(false);
    expect(isVisitorId('short')).toBe(false);
    expect(isVisitorId(`${'a'.repeat(31)}!`)).toBe(false);
  });

  it('stores a hash, never the id', () => {
    const id = newVisitorId();
    expect(hashVisitor(id)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashVisitor(id)).toBe(hashVisitor(id));
    expect(hashVisitor(id)).not.toContain(id);
  });
});

describe('utcDay', () => {
  it('is midnight UTC of the day containing the instant', () => {
    expect(utcDay(new Date('2026-10-28T23:59:59.999Z')).toISOString()).toBe('2026-10-28T00:00:00.000Z');
    expect(utcDay(new Date('2026-10-29T00:00:00.000Z')).toISOString()).toBe('2026-10-29T00:00:00.000Z');
  });
});

describe('viewerHash', () => {
  const today = utcDay(new Date('2026-10-28T12:00:00Z'));
  const tomorrow = utcDay(new Date('2026-10-29T12:00:00Z'));

  it('is the same for one visitor within a day', () => {
    expect(viewerHash(SECRET, today, '1.2.3.4', CHROME)).toBe(viewerHash(SECRET, today, '1.2.3.4', CHROME));
  });

  it('cannot be matched across days', () => {
    expect(viewerHash(SECRET, today, '1.2.3.4', CHROME)).not.toBe(viewerHash(SECRET, tomorrow, '1.2.3.4', CHROME));
  });

  it('tells visitors apart by address and by browser', () => {
    const base = viewerHash(SECRET, today, '1.2.3.4', CHROME);
    expect(viewerHash(SECRET, today, '1.2.3.5', CHROME)).not.toBe(base);
    expect(viewerHash(SECRET, today, '1.2.3.4', 'Firefox')).not.toBe(base);
  });

  it('is keyed, so it cannot be recomputed without the secret', () => {
    expect(viewerHash(SECRET, today, '1.2.3.4', CHROME)).not.toBe(
      viewerHash('b'.repeat(32), today, '1.2.3.4', CHROME),
    );
  });

  it('does not contain the address', () => {
    expect(viewerHash(SECRET, today, '1.2.3.4', CHROME)).not.toContain('1.2.3.4');
  });
});

describe('isBot', () => {
  it('passes a browser', () => {
    expect(isBot(CHROME)).toBe(false);
  });

  it('catches crawlers, unfurlers and scripts', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot('Mozilla/5.0 HeadlessChrome/130.0')).toBe(true);
    expect(isBot('curl/8.4.0')).toBe(true);
  });

  it('treats a missing user agent as not a browser', () => {
    expect(isBot(null)).toBe(true);
    expect(isBot('')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { CRON_HOUR_UTC, estimatedSendTime, isQuiet, QUIET_HOURS } from '@/lib/newsletter/schedule';

const HOUR = 60 * 60 * 1000;

describe('isQuiet', () => {
  const newest = new Date('2026-09-20T10:00:00Z');

  it('waits while the batch is still being added to', () => {
    expect(isQuiet(newest, new Date(newest.getTime() + (QUIET_HOURS - 1) * HOUR))).toBe(false);
  });

  it('is ready once the quiet period has passed', () => {
    expect(isQuiet(newest, new Date(newest.getTime() + QUIET_HOURS * HOUR))).toBe(true);
  });
});

describe('estimatedSendTime', () => {
  it('lands on the first cron run after the batch goes quiet', () => {
    // Quiet at 22:00 the same day, which is past the cron hour, so the next day.
    const sent = estimatedSendTime(new Date('2026-09-20T10:00:00Z'));
    expect(sent.toISOString()).toBe(`2026-09-21T${String(CRON_HOUR_UTC).padStart(2, '0')}:00:00.000Z`);
  });

  it('can be the same day when the batch goes quiet before the cron hour', () => {
    const newest = new Date(Date.UTC(2026, 8, 20, CRON_HOUR_UTC - QUIET_HOURS - 1));
    const sent = estimatedSendTime(newest);
    expect(sent.getUTCDate()).toBe(20);
    expect(sent.getUTCHours()).toBe(CRON_HOUR_UTC);
  });

  it('is never before the batch is quiet', () => {
    for (let hour = 0; hour < 24; hour++) {
      const newest = new Date(Date.UTC(2026, 8, 20, hour, 30));
      expect(isQuiet(newest, estimatedSendTime(newest))).toBe(true);
    }
  });
});

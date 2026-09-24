/**
 * When a pending batch goes out.
 *
 * There is no calendar: the batch is sent once nothing new has been added to it
 * for QUIET_HOURS, which is what folds an afternoon of uploads into one email
 * while a single post still goes out the next day. The cron that checks runs
 * once a day (the Hobby plan's ceiling), so the real delay is QUIET_HOURS
 * rounded up to the next run.
 */

/** Hours with nothing new before a pending batch is considered finished. */
export const QUIET_HOURS = 12;

/**
 * The cron's hour, in UTC. Must match the schedule in vercel.json — this copy
 * exists only so the admin can be told roughly when the batch will go out.
 * Hobby runs a daily cron somewhere inside its hour, not on the minute.
 */
export const CRON_HOUR_UTC = 14;

/** How soon the confirmation email may be sent again to the same address. */
export const CONFIRM_RESEND_MS = 10 * 60 * 1000;

/** How long an unconfirmed signup is kept before the cron deletes it. */
export const UNCONFIRMED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/** Whether a batch whose newest item was added at `newest` has gone quiet. */
export function isQuiet(newest: Date, now: Date): boolean {
  return now.getTime() - newest.getTime() >= QUIET_HOURS * HOUR_MS;
}

/**
 * The first cron run at which a batch whose newest item was added at `newest`
 * will be quiet — an estimate for the admin page, since Hobby may fire anywhere
 * in the hour. Adding anything to the batch moves this.
 */
export function estimatedSendTime(newest: Date): Date {
  const quietAt = newest.getTime() + QUIET_HOURS * HOUR_MS;
  const run = new Date(quietAt);
  run.setUTCHours(CRON_HOUR_UTC, 0, 0, 0);
  if (run.getTime() < quietAt) run.setUTCDate(run.getUTCDate() + 1);
  return run;
}

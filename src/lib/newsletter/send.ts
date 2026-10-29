import { createHash } from 'node:crypto';
import { emailEnv } from '@/lib/env';

/**
 * The one door to Resend. Server-only — it reads the API key.
 *
 * Development and preview deployments point at the *production* database (see
 * Release flow in docs/architecture.md), so the subscriber list they can read
 * is the real one. Anything that is not the production deployment may
 * therefore only email the addresses in NEWSLETTER_TEST_EMAIL; everyone else is
 * dropped and logged. Preview deployments are also meant to carry no
 * RESEND_API_KEY at all — this is the second lock, not the only one.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

type EnvSource = Record<string, string | undefined>;

/** Vercel's own name for the deployment's environment, set at runtime. */
export function isProductionDeployment(source: EnvSource = process.env): boolean {
  return source.VERCEL_ENV === 'production';
}

/** NEWSLETTER_TEST_EMAIL, lowercased: a comma-separated list is allowed. */
export function testRecipients(source: EnvSource = process.env): string[] {
  return (source.NEWSLETTER_TEST_EMAIL ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

export function mayEmail(address: string, source: EnvSource = process.env): boolean {
  return (
    isProductionDeployment(source) || testRecipients(source).includes(address.toLowerCase())
  );
}

/** Whether email is configured at all, without throwing like `emailEnv()` does. */
export function emailConfigured(source: EnvSource = process.env): boolean {
  return Boolean(source.RESEND_API_KEY && source.EMAIL_FROM);
}

/** Resend's batch endpoint takes at most this many emails per request. */
export const BATCH_LIMIT = 100;

/**
 * A key for one exact batch: the same recipients get the same key, so a retry
 * after a crash between sending and recording is answered from Resend's
 * 24-hour idempotency cache instead of emailing everyone in it twice.
 */
export function batchKey(scope: string, recipients: string[]): string {
  const digest = createHash('sha256').update(recipients.join('\n')).digest('hex').slice(0, 32);
  return `${scope}-${digest}`;
}

export class EmailError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * Sends up to BATCH_LIMIT emails in one request. Returns how many were actually
 * handed to Resend after the environment guard. Throws EmailError on any
 * refusal — including the daily quota, which is how a large dispatch stops
 * partway and resumes on the next cron run.
 */
export async function sendEmails(emails: OutgoingEmail[], idempotencyKey?: string): Promise<number> {
  if (emails.length > BATCH_LIMIT) {
    throw new Error(`sendEmails takes at most ${BATCH_LIMIT} emails, got ${emails.length}`);
  }

  const allowed = emails.filter((email) => mayEmail(email.to));
  const dropped = emails.length - allowed.length;
  if (dropped) {
    console.warn(
      `Newsletter: not sending ${dropped} email(s) outside production. ` +
        'Add the address to NEWSLETTER_TEST_EMAIL to receive them here.',
    );
  }
  if (!allowed.length) return 0;

  const { RESEND_API_KEY, EMAIL_FROM } = emailEnv();
  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(
      allowed.map((email) => ({
        from: EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.headers ? { headers: email.headers } : {}),
      })),
    ),
  });

  if (!response.ok) {
    // The body names the reason (bad key, unverified domain, quota) and carries
    // no recipient data, so it is safe for the server log — not for a browser.
    const detail = await response.text().catch(() => '');
    throw new EmailError(`Resend refused the batch (${response.status}): ${detail}`, response.status);
  }
  return allowed.length;
}

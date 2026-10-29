'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { attemptOr } from '@/lib/actions/errors';
import { clientKey } from '@/lib/auth/rate-limit';
import { renderConfirmation } from '@/lib/newsletter/digest';
import { subscriberEmailSchema } from '@/lib/newsletter/email';
import { preferencesSchema, type Preferences } from '@/lib/newsletter/kinds';
import { confirmUrl, newToken } from '@/lib/newsletter/links';
import { linkOrigin } from '@/lib/newsletter/origin';
import { CONFIRM_RESEND_MS } from '@/lib/newsletter/schedule';
import { emailConfigured, sendEmails } from '@/lib/newsletter/send';
import { allowSignup } from '@/lib/newsletter/throttle';

/**
 * The newsletter's public actions. Unlike every other action in this app these
 * are *meant* to be called without a session — the token in the link is the
 * credential — so there is no `isAuthenticated()` here, and nothing below may
 * reveal whether an address is subscribed.
 *
 * `attemptOr` rather than `attempt`: the admin-facing messages that one maps
 * Prisma errors to ("check the server log") mean nothing to a visitor.
 */

type Result = { error?: string };

const FAILED: Result = { error: 'Something went wrong on our end. Try again in a moment.' };

const tokenSchema = z.string().min(1).max(64);

const subscribeSchema = z.object({
  email: subscriberEmailSchema,
  prefs: preferencesSchema,
  // The honeypot. Hidden from people and from assistive tech; a bot filling
  // every field fills this one too.
  website: z.string().optional(),
});

export type SubscribeInput = { email: string; prefs: Preferences; website?: string };

export async function subscribe(input: SubscribeInput): Promise<Result> {
  return attemptOr('subscribe', FAILED, async () => {
    const parsed = subscribeSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { email, prefs, website } = parsed.data;
    // Answer a bot exactly as a person is answered, so it has no reason to try
    // again differently.
    if (website) return {};

    if (!emailConfigured()) return { error: 'Sign-ups are not open yet — check back soon.' };
    if (!allowSignup(clientKey(await headers()))) {
      return { error: 'Too many sign-ups from this connection. Try again in an hour.' };
    }

    const now = new Date();
    const existing = await db.subscriber.findUnique({ where: { email } });

    // Every path below returns the same `{}`, so the form cannot be used to find
    // out who is subscribed. A confirmed subscriber is left exactly as they were
    // — their choices are changed from their own manage link, not by whoever
    // typed their address in.
    if (existing?.confirmedAt) return {};

    if (existing && now.getTime() - existing.confirmSentAt.getTime() < CONFIRM_RESEND_MS) {
      await db.subscriber.update({ where: { id: existing.id }, data: prefs });
      return {};
    }

    let token: string;
    if (existing) {
      token = existing.token;
      await db.subscriber.update({ where: { id: existing.id }, data: { ...prefs, confirmSentAt: now } });
    } else {
      token = newToken();
      try {
        await db.subscriber.create({ data: { email, token, ...prefs, confirmSentAt: now } });
      } catch (cause) {
        // The same address submitted twice at once: the other request is
        // already sending the confirmation.
        if ((cause as { code?: unknown }).code === 'P2002') return {};
        throw cause;
      }
    }

    const site = await linkOrigin();
    try {
      await sendEmails([{ to: email, ...renderConfirmation(confirmUrl(site, token), site) }]);
    } catch (cause) {
      console.error('Newsletter: confirmation email failed', cause);
      // A brand-new row nobody can confirm is only clutter; take it back out so
      // a retry starts clean.
      if (!existing) await db.subscriber.deleteMany({ where: { email, confirmedAt: null } });
      return { error: 'We couldn’t send the confirmation email. Try again later.' };
    }
    return {};
  });
}

export async function confirmSubscription(token: string): Promise<Result> {
  return attemptOr('confirmSubscription', FAILED, async () => {
    if (!tokenSchema.safeParse(token).success) return { error: 'This link isn’t valid.' };

    const { count } = await db.subscriber.updateMany({
      where: { token, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    if (count) return {};

    // Nothing to update is fine if they had already confirmed.
    const subscriber = await db.subscriber.findUnique({ where: { token }, select: { id: true } });
    return subscriber ? {} : { error: 'This link has expired. Sign up again and use the newest email.' };
  });
}

export async function updatePreferences(token: string, prefs: Preferences): Promise<Result> {
  return attemptOr('updatePreferences', FAILED, async () => {
    if (!tokenSchema.safeParse(token).success) return { error: 'This link isn’t valid.' };
    const parsed = preferencesSchema.safeParse(prefs);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { count } = await db.subscriber.updateMany({ where: { token }, data: parsed.data });
    return count ? {} : { error: 'You’re no longer subscribed, so there is nothing to change.' };
  });
}

/**
 * Deletes the row outright rather than flagging it: there is nothing an
 * unsubscribed address is needed for, and nothing kept cannot leak.
 */
export async function unsubscribe(token: string): Promise<Result> {
  return attemptOr('unsubscribe', FAILED, async () => {
    if (!tokenSchema.safeParse(token).success) return { error: 'This link isn’t valid.' };
    await db.subscriber.deleteMany({ where: { token } });
    return {};
  });
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { attempt } from '@/lib/actions/errors';
import { CONTENT_KINDS } from '@/lib/newsletter/kinds';
import { MESSAGE_MAX } from '@/lib/newsletter/layout';
import { runDispatch, saveDraft, sendPreview } from '@/lib/newsletter/queue';
import { emailConfigured } from '@/lib/newsletter/send';

const idSchema = z.string().min(1);
const kindSchema = z.enum(CONTENT_KINDS);

/**
 * Sends the pending batch now instead of waiting for it to go quiet. Also
 * resumes a dispatch that stopped partway, since runDispatch always finishes
 * the unfinished one first.
 */
export async function sendNow(): Promise<{ error?: string; message?: string }> {
  return attempt('sendNow', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    if (!emailConfigured()) return { error: 'Email is not configured — set RESEND_API_KEY and EMAIL_FROM.' };

    const report = await runDispatch({ force: true });
    revalidatePath('/admin/newsletter');

    switch (report.status) {
      case 'blocked':
        return {
          error:
            'Sending to subscribers only works on the production deployment. Here it would use up the batch without delivering it — use “Send a test to me” instead.',
        };
      case 'idle':
        return { error: 'Nothing is pending.' };
      case 'waiting':
        // Unreachable with force, but the type allows it.
        return { error: 'The batch is not ready yet.' };
      case 'partial':
        return { error: `Sent ${report.sent} before stopping. ${report.error}` };
      case 'sent':
        return { message: `Sent to ${report.sent} subscriber${report.sent === 1 ? '' : 's'}.` };
    }
  });
}

export async function emailPreview(): Promise<{ error?: string; message?: string }> {
  return attempt('emailPreview', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    if (!emailConfigured()) return { error: 'Email is not configured — set RESEND_API_KEY and EMAIL_FROM.' };

    const result = await sendPreview();
    if (result.error) return { error: result.error };
    return { message: 'Preview sent — check your inbox.' };
  });
}

/** Takes an item out of the batch, or (skipped = false) puts it back. */
export async function setSkipped(announcementId: string, skipped: boolean): Promise<{ error?: string }> {
  return attempt('setSkipped', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    if (!idSchema.safeParse(announcementId).success) return { error: 'Unknown item' };

    // dispatchId: null, so an item already sent cannot be toggled after the fact.
    await db.announcement.updateMany({
      where: { id: announcementId, dispatchId: null },
      data: { skipped },
    });
    revalidatePath('/admin/newsletter');
    return {};
  });
}

/**
 * Confirms a signup on the subscriber's behalf, for someone known to want it
 * who never clicked the link. It skips the one check double opt-in exists for,
 * so it is the admin's word that the address is theirs.
 */
export async function confirmSubscriber(id: string): Promise<{ error?: string }> {
  return attempt('confirmSubscriber', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    if (!idSchema.safeParse(id).success) return { error: 'Unknown subscriber' };

    // confirmedAt: null, so confirming twice keeps the first date — the
    // dispatch reads it as when they joined.
    await db.subscriber.updateMany({ where: { id, confirmedAt: null }, data: { confirmedAt: new Date() } });
    revalidatePath('/admin/newsletter');
    return {};
  });
}

export async function removeSubscriber(id: string): Promise<{ error?: string }> {
  return attempt('removeSubscriber', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    if (!idSchema.safeParse(id).success) return { error: 'Unknown subscriber' };

    await db.subscriber.deleteMany({ where: { id } });
    revalidatePath('/admin/newsletter');
    return {};
  });
}

/** The note at the top of the next email. Empty clears it. */
export async function saveMessage(message: string): Promise<{ error?: string }> {
  return attempt('saveMessage', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = z.string().max(MESSAGE_MAX).safeParse(message);
    if (!parsed.success) return { error: `Keep the note under ${MESSAGE_MAX} characters.` };

    await saveDraft({ message: parsed.data.trim() });
    revalidatePath('/admin/newsletter');
    return {};
  });
}

/** The order of the email's sections, every kind exactly once. */
export async function setSectionOrder(order: string[]): Promise<{ error?: string }> {
  return attempt('setSectionOrder', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = z.array(kindSchema).length(CONTENT_KINDS.length).safeParse(order);
    if (!parsed.success || new Set(parsed.data).size !== CONTENT_KINDS.length) return { error: 'Unknown section order' };

    await saveDraft({ sections: parsed.data });
    revalidatePath('/admin/newsletter');
    return {};
  });
}

/**
 * Places one section's items in the order given. Only pending items move —
 * dispatchId: null — so an item claimed by a send that began meanwhile keeps
 * the place it went out in.
 */
export async function reorderSection(kind: string, ids: string[]): Promise<{ error?: string }> {
  return attempt('reorderSection', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = z.object({ kind: kindSchema, ids: z.array(idSchema).max(500) }).safeParse({ kind, ids });
    if (!parsed.success) return { error: 'Unknown items' };

    await db.$transaction(
      parsed.data.ids.map((id, position) =>
        db.announcement.updateMany({
          where: { id, kind: parsed.data.kind, dispatchId: null },
          data: { position },
        }),
      ),
    );
    revalidatePath('/admin/newsletter');
    return {};
  });
}

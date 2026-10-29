'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { attempt } from '@/lib/actions/errors';
import { runDispatch, sendPreview } from '@/lib/newsletter/queue';
import { emailConfigured } from '@/lib/newsletter/send';

const idSchema = z.string().min(1);

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
            'Sending to subscribers only works on the production deployment. Here it would use up the batch without delivering it — use “Email me a preview” instead.',
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

export async function removeSubscriber(id: string): Promise<{ error?: string }> {
  return attempt('removeSubscriber', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    if (!idSchema.safeParse(id).success) return { error: 'Unknown subscriber' };

    await db.subscriber.deleteMany({ where: { id } });
    revalidatePath('/admin/newsletter');
    return {};
  });
}

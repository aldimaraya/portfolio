import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { abortMultipart } from '@/lib/storage/multipart';

export const runtime = 'nodejs';

const body = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
});

/**
 * Discards a multipart upload that will never be completed. Without this the
 * parts already sent stay in the bucket indefinitely — billed, and invisible to
 * a normal object listing, so the cost accrues silently.
 *
 * Best-effort by design: the client calls it while already handling a failure,
 * so an error here must not replace the error that actually matters. The bucket
 * lifecycle rule (see docs) is the backstop for the cases the browser never gets
 * to report, like a closed tab.
 */
export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid abort request' }, { status: 400 });
  }

  try {
    await abortMultipart(parsed.data.key, parsed.data.uploadId);
  } catch (cause) {
    console.error('Could not abort multipart upload', parsed.data.key, cause);
    return NextResponse.json({ error: 'Could not abort the upload' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

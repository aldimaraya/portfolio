import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { buildObjectKey } from '@/lib/storage/r2';
import { createMultipart } from '@/lib/storage/multipart';

export const runtime = 'nodejs';

const body = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  prefix: z.enum(['photos', 'videos', 'posters', 'sprites']),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  // The key is minted server-side so a client can't choose where it writes.
  const key = buildObjectKey(parsed.data.filename, parsed.data.prefix);
  const uploadId = await createMultipart(key, parsed.data.contentType);
  return NextResponse.json({ key, uploadId });
}

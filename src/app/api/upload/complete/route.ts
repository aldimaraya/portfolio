import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { completeMultipart } from '@/lib/storage/multipart';

export const runtime = 'nodejs';

const body = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z
    .array(z.object({ ETag: z.string().min(1), PartNumber: z.number().int().min(1) }))
    .min(1),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid completion request' }, { status: 400 });
  }

  const url = await completeMultipart(parsed.data.key, parsed.data.uploadId, parsed.data.parts);
  return NextResponse.json({ url });
}

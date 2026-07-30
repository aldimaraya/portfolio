import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { signPartUrl } from '@/lib/storage/multipart';

export const runtime = 'nodejs';

const body = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1).max(10_000),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid part request' }, { status: 400 });
  }

  const url = await signPartUrl(parsed.data.key, parsed.data.uploadId, parsed.data.partNumber);
  return NextResponse.json({ url });
}

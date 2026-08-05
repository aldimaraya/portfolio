import type { NextRequest } from 'next/server';
import { streamStoredObject } from '@/lib/storage/media-source';

/**
 * The stored photo, served back through our own origin so the border trimmer can
 * read untainted pixels off a canvas. See streamStoredObject for why.
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return streamStoredObject(request, 'Could not read that image');
}

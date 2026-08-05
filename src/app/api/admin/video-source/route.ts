import type { NextRequest } from 'next/server';
import { streamStoredObject } from '@/lib/storage/media-source';

/**
 * The stored clip, served back through our own origin so the admin can re-grab
 * its frames — regenerating a scrub preview draws the video to a canvas, and a
 * cross-origin source would taint it. See streamStoredObject.
 *
 * This is the one place a whole clip passes through the app server. It is
 * admin-only and deliberate: the alternative is CORS on the bucket, which is
 * configuration living outside this repo. Large clips may be slow.
 */
export const runtime = 'nodejs';
// Regenerating a preview streams the entire file; the default is far too short
// for a few hundred megabytes.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return streamStoredObject(request, 'Could not read that clip');
}

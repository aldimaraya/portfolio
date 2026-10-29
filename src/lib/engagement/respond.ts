import { NextResponse, type NextRequest } from 'next/server';
import { hashVisitor, isVisitorId, VISITOR_COOKIE } from './visitor';

/**
 * Pieces shared by the /api/engagement handlers. Kept out of the route files so
 * each of those reads as the one decision it makes.
 */

/**
 * Every answer says whether *this* visitor liked the item, so none of them may
 * be cached by anything between here and the browser — a CDN holding one
 * visitor's `liked: true` would hand it to the next.
 */
const PRIVATE = { 'Cache-Control': 'no-store, private' };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE });
}

/**
 * The plain sentence a visitor sees when something below validation fails. As
 * with attemptOr in the newsletter actions, nothing here may name a table or a
 * query; the cause goes to the log.
 */
export function failed(scope: string, cause: unknown): NextResponse {
  console.error(`Engagement: ${scope} failed`, cause);
  return json({ error: 'Something went wrong on our end. Try again in a moment.' }, 500);
}

/** The cookie's id, if it carries one this site issued. */
export function visitorId(request: NextRequest): string | null {
  const value = request.cookies.get(VISITOR_COOKIE)?.value;
  return isVisitorId(value) ? value : null;
}

/** The stored form of the visitor's id, or null for someone who has never liked anything. */
export function visitorKey(request: NextRequest): string | null {
  const id = visitorId(request);
  return id ? hashVisitor(id) : null;
}

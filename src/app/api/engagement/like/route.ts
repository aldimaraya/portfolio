import type { NextRequest } from 'next/server';
import { clientKey } from '@/lib/auth/rate-limit';
import { countsFor, isPublicTarget, setLike } from '@/lib/engagement/counts';
import { likeSchema } from '@/lib/engagement/kinds';
import { failed, json, visitorId } from '@/lib/engagement/respond';
import { allowWrite } from '@/lib/engagement/throttle';
import {
  hashVisitor,
  newVisitorId,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE_SECONDS,
} from '@/lib/engagement/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Likes or unlikes one item: `{ kind, id, liked }`, answered with the item's
 * fresh counts. Public on purpose, like the newsletter's actions — a like
 * belongs to a cookie, not to an account, and there are no accounts.
 *
 * Recorded in every environment, unlike a view. Development and previews share
 * production's database, so a like made while testing is a real like — but one
 * the same browser can take back, which a stray view could not be.
 */
export async function POST(request: NextRequest) {
  const parsed = likeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Unknown item' }, 400);

  const { liked, ...target } = parsed.data;

  if (!allowWrite('like', clientKey(request.headers))) {
    return json({ error: 'That’s a lot of likes. Try again in a while.' }, 429);
  }

  try {
    if (!(await isPublicTarget(target))) return json({ error: 'Unknown item' }, 404);

    const existing = visitorId(request);
    // Nobody to unlike for: a visitor with no cookie has never liked anything,
    // and minting them one just to record that would be the one cookie here set
    // without a reason.
    if (!existing && !liked) return json(await countsFor(target, null));

    const id = existing ?? newVisitorId();
    const visitor = hashVisitor(id);
    await setLike(target, visitor, liked);

    const response = json(await countsFor(target, visitor));
    // Re-set on every like, not only the first, so a visitor who keeps coming
    // back keeps their likes past the year.
    response.cookies.set(VISITOR_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: VISITOR_MAX_AGE_SECONDS,
    });
    return response;
  } catch (cause) {
    return failed('like', cause);
  }
}

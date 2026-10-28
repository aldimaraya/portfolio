import type { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth/guard';
import { clientKey } from '@/lib/auth/rate-limit';
import { countsFor, isPublicTarget, recordView } from '@/lib/engagement/counts';
import { viewSchema } from '@/lib/engagement/kinds';
import { failed, json, visitorKey } from '@/lib/engagement/respond';
import { allowWrite } from '@/lib/engagement/throttle';
import { isBot, utcDay, viewerHash } from '@/lib/engagement/visitor';
import { authEnv } from '@/lib/env';
import { isProductionDeployment } from '@/lib/newsletter/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Counts a view of a clip or a post, `{ kind, id }`, and answers with the
 * item's counts — so a page that shows its numbers makes one request, not two.
 *
 * The answer is the same whether or not a view was recorded, and there are
 * several reasons one is not:
 * - Outside production. Development and previews share production's database,
 *   and every reload while working on a page would otherwise count.
 * - The admin. Their own visits are not readers.
 * - A self-announced bot, or an address past its budget.
 */
export async function POST(request: NextRequest) {
  const parsed = viewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Unknown item' }, 400);

  const target = parsed.data;
  const address = clientKey(request.headers);
  const userAgent = request.headers.get('user-agent');

  try {
    // Cheapest first: the session check is a JWT verify and the target check a
    // query, and neither should be spent on a request already turned away.
    const record =
      isProductionDeployment() &&
      !isBot(userAgent) &&
      allowWrite('view', address) &&
      !(await isAuthenticated()) &&
      (await isPublicTarget(target));

    if (record) {
      const day = utcDay(new Date());
      await recordView(target, day, viewerHash(authEnv().SESSION_SECRET, day, address, userAgent ?? ''));
    }

    return json(await countsFor(target, visitorKey(request)));
  } catch (cause) {
    return failed('view', cause);
  }
}

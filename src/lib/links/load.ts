import { cache } from 'react';
import { db } from '@/lib/db';

/**
 * The links in display order. Wrapped in `cache` because /stills needs them
 * twice in one render — the site layout draws them, and the page's Person
 * schema lists the profiles among them — and that should be one query.
 * createdAt breaks ties, as it does for rolls.
 */
export const loadSiteLinks = cache(() =>
  db.siteLink.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, label: true, href: true, profile: true },
  }),
);

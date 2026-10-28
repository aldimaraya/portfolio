'use client';

import type { ViewableKind } from '@/lib/engagement/kinds';
import { formatViews } from '@/lib/engagement/format';
import { useEngagement } from './useEngagement';

/**
 * "1.2k views", or nothing until the count arrives — not "0 views" in the
 * meantime, which would be a claim about a number nobody has read yet.
 * Always records the view: it only belongs on the page that is the item.
 */
export function ViewCount({
  kind,
  id,
  className = '',
}: {
  kind: ViewableKind;
  id: string;
  className?: string;
}) {
  const { counts } = useEngagement(kind, id, { view: true });
  if (!counts) return null;

  return <span className={`tabular-nums ${className}`}>{formatViews(counts.views ?? 0)}</span>;
}

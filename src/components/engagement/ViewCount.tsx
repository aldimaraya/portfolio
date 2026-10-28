'use client';

import type { ViewableKind } from '@/lib/engagement/kinds';
import { formatViews } from '@/lib/engagement/format';
import { useEngagement } from './useEngagement';

/**
 * "1.2k views", or nothing — before the count arrives, and while it is zero.
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
  const printed = formatViews(counts?.views ?? 0);
  if (!printed) return null;

  return <span className={`tabular-nums ${className}`}>{printed}</span>;
}

/**
 * A count as it is printed: `7`, `1.2k`, `34k`, `1.5m`. Zero is an empty
 * string, not "0" — a heart with nothing beside it reads as an invitation.
 * Views are the exception; see formatViews.
 */
export function formatCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count < 1000) return String(Math.floor(count));
  if (count < 1_000_000) return compact(count / 1000, 'k');
  return compact(count / 1_000_000, 'm');
}

/**
 * One decimal under ten, none above, and always rounded *down*: 999 likes must
 * not print as "1k", and 1,999 must not print as "2k" — a count is allowed to
 * look smaller than it is, never larger.
 */
function compact(value: number, unit: string): string {
  const digits = value < 10 ? 1 : 0;
  const factor = 10 ** digits;
  const floored = Math.floor(value * factor) / factor;
  return `${floored.toFixed(digits).replace(/\.0$/, '')}${unit}`;
}

/**
 * "0 views", "1 view", "1.2k views". Zero is printed here, unlike a like
 * count: with nothing shown until the first view landed, the counter looked
 * missing rather than empty — and views are only recorded on production, so
 * outside it a page never got past nothing.
 */
export function formatViews(count: number): string {
  const printed = formatCount(count) || '0';
  return `${printed} ${count === 1 ? 'view' : 'views'}`;
}

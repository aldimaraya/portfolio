/**
 * Pure wording helpers shared by the admin's server pages and its client
 * components. Kept apart from overview.ts because that module imports `db`, and
 * a client component importing it would drag the Prisma client into the bundle.
 */

/** "1 visitor", "5 visitors" — the pair, since some nouns carry their verb ("still has"). */
export function countOf(count: number, [one, many]: [string, string]): string {
  return `${count} ${count === 1 ? one : many}`;
}

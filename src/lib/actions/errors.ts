/**
 * The far end of every server action's `{ error }` contract.
 *
 * Auth and validation failures already return a message the form renders; a
 * failure below that line — a dropped Neon connection, a row deleted in another
 * tab — throws out of the action instead, and a thrown server action reaches the
 * client as a rejected promise that no `if (result.error)` branch can see. The
 * admin gets a dead button and nothing on screen. `attempt` puts the floor
 * under that so the same contract holds all the way down.
 *
 * This module is deliberately *not* in an action file: everything exported from
 * a `'use server'` module becomes a publicly callable endpoint, and a helper
 * that runs an arbitrary callback is the last thing that should be one.
 */

/**
 * Prisma's known-request errors are matched by duck-typing their `code` rather
 * than by `instanceof PrismaClientKnownRequestError`, so this file — and its
 * tests — never import the generated client and never need a DATABASE_URL.
 * The shape is also what survives the boundary intact: an error crossing a
 * driver or a serialisation layer keeps its `code`, not its prototype.
 */
function errorCode(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null) return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * What the admin is told when an action fails past validation. Deliberately
 * plain sentences: the browser is a public surface, so nothing here may carry a
 * table name, a constraint name, a query, or a stack — those go to the server
 * log via `attempt`, where they are actually useful. Only the codes with an
 * unambiguous meaning are translated; anything else gets the generic line,
 * because a confidently wrong diagnosis is worse than an honest shrug.
 */
export function prismaErrorMessage(cause: unknown): string | null {
  switch (errorCode(cause)) {
    // Update or delete against a row that is no longer there — almost always a
    // second tab, or a list rendered before something in it was removed.
    case 'P2025':
      return 'Something you were editing no longer exists. Reload the page and try again.';
    // Unique constraint. The only unique columns the admin can collide on are
    // slugs and tag names, so "already in use" is true without naming either.
    case 'P2002':
      return 'That value is already in use. Change it and try again.';
    // A relation pointing at a row that is gone — same cause as P2025 from the
    // admin's side, and the same remedy.
    case 'P2003':
      return 'Something this refers to no longer exists. Reload the page and try again.';
    // The connection, not the data: worth distinguishing because retrying is
    // the right move here and pointless for the others.
    case 'P1001':
    case 'P1002':
    case 'P1017':
      return 'Could not reach the database. Try again in a moment.';
    default:
      return null;
  }
}

export const GENERIC_ACTION_ERROR =
  'Something went wrong and the change was not saved. Try again — if it keeps failing, check the server log.';

/** The message for any failure, with the generic line as the floor. */
export function actionErrorMessage(cause: unknown): string {
  return prismaErrorMessage(cause) ?? GENERIC_ACTION_ERROR;
}

/**
 * Runs a server action's body and converts anything it throws into the
 * `{ error }` the caller already knows how to render. `label` names the action
 * in the log — the only place the real cause is allowed to appear.
 */
export async function attempt<T extends object>(
  label: string,
  run: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (cause) {
    console.error(`Server action failed: ${label}`, cause);
    return { error: actionErrorMessage(cause) };
  }
}

/**
 * The same floor for an action whose return type has no room for an error —
 * `listPostMedia` answers with a library, and a picker that opens empty is a
 * better failure than one that rejects and takes the editor down with it.
 */
export async function attemptOr<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    console.error(`Server action failed: ${label}`, cause);
    return fallback;
  }
}

/**
 * When the signup prompt may interrupt someone. Client-side only: it reads
 * localStorage, which is a per-browser convenience here and nothing more — a
 * cleared or blocked store just means the prompt may be seen once more.
 */

/** How long someone browses before being asked. */
export const PROMPT_DELAY_MS = 20_000;

/** How often to look again when the moment is wrong (a photo is open). */
export const PROMPT_RETRY_MS = 5_000;

export const PROMPT_STORAGE_KEY = 'newsletter-prompt';

/** Either answer means never ask again — closing it is an answer too. */
export type PromptAnswer = 'dismissed' | 'subscribed';

export function promptAnswered(): boolean {
  try {
    return localStorage.getItem(PROMPT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function rememberPromptAnswer(answer: PromptAnswer): void {
  try {
    localStorage.setItem(PROMPT_STORAGE_KEY, answer);
  } catch {
    // Private mode or blocked storage: the prompt may come back once. Harmless.
  }
}

/**
 * Pages where a prompt to subscribe would be absurd: the newsletter's own
 * pages, where the visitor is already subscribing, confirming or leaving.
 */
export function promptSuppressedOn(pathname: string): boolean {
  return pathname === '/newsletter' || pathname.startsWith('/newsletter/');
}

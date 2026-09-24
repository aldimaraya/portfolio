import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  promptAnswered,
  promptSuppressedOn,
  PROMPT_STORAGE_KEY,
  rememberPromptAnswer,
} from '@/lib/newsletter/prompt';

// A stub rather than jsdom's storage: newer Node versions put their own
// localStorage global in front of it, which is undefined without a flag.
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

describe('prompt answers', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('is unanswered in a fresh browser', () => {
    expect(promptAnswered()).toBe(false);
  });

  it('treats dismissing as an answer, not only subscribing', () => {
    rememberPromptAnswer('dismissed');
    expect(promptAnswered()).toBe(true);
    expect(localStorage.getItem(PROMPT_STORAGE_KEY)).toBe('dismissed');
  });
});

describe('promptSuppressedOn', () => {
  it('stays off the newsletter’s own pages', () => {
    expect(promptSuppressedOn('/newsletter')).toBe(true);
    expect(promptSuppressedOn('/newsletter/manage')).toBe(true);
  });

  it('is allowed everywhere else', () => {
    expect(promptSuppressedOn('/stills')).toBe(false);
    expect(promptSuppressedOn('/newsletters-elsewhere')).toBe(false);
  });
});

describe('blocked storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('neither throws nor claims an answer', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => rememberPromptAnswer('dismissed')).not.toThrow();
    expect(promptAnswered()).toBe(false);
  });
});

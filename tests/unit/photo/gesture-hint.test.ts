import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  GESTURE_HINT_STORAGE_KEY,
  gestureHintSeen,
  rememberGestureHint,
} from '@/lib/photo/gesture-hint';

// A stub rather than jsdom's storage, for the same reason as prompt.test.ts.
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

describe('gesture hint', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('with working storage', () => {
    beforeEach(() => vi.stubGlobal('sessionStorage', memoryStorage()));

    it('has not been seen at the start of a session', () => {
      expect(gestureHintSeen()).toBe(false);
    });

    it('is seen once remembered', () => {
      rememberGestureHint();
      expect(gestureHintSeen()).toBe(true);
      expect(sessionStorage.getItem(GESTURE_HINT_STORAGE_KEY)).toBe('seen');
    });
  });

  it('reads blocked storage as not seen, and remembering does not throw', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(gestureHintSeen()).toBe(false);
    expect(() => rememberGestureHint()).not.toThrow();
  });
});

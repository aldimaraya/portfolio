import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { JOURNAL_LAYOUT, MOTION_LAYOUT } from '@/lib/revalidate';

// The tag these expire is named after the route on disk, so each must still be a
// directory under app/ — a group renamed or a section moved would otherwise put
// the revalidation back to silently matching nothing.
describe('section layout paths', () => {
  it.each([MOTION_LAYOUT, JOURNAL_LAYOUT])('%s is a real route directory', (path) => {
    expect(existsSync(join(process.cwd(), 'src/app', path))).toBe(true);
  });
});

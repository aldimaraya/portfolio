import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  prismaErrorMessage,
  actionErrorMessage,
  attempt,
  attemptOr,
  GENERIC_ACTION_ERROR,
} from '@/lib/actions/errors';

/** What a Prisma known-request error looks like from the outside. */
function prismaError(code: string, message = 'Invalid `prisma.video.update()` invocation') {
  return Object.assign(new Error(message), { code, meta: { modelName: 'Video' } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prismaErrorMessage', () => {
  it('translates the codes an admin can actually cause', () => {
    expect(prismaErrorMessage(prismaError('P2025'))).toMatch(/no longer exists/);
    expect(prismaErrorMessage(prismaError('P2002'))).toMatch(/already in use/);
    expect(prismaErrorMessage(prismaError('P2003'))).toMatch(/no longer exists/);
    expect(prismaErrorMessage(prismaError('P1001'))).toMatch(/database/i);
  });

  it('declines to guess at an unmapped code', () => {
    expect(prismaErrorMessage(prismaError('P2010'))).toBeNull();
  });

  it('ignores anything that is not a coded error', () => {
    expect(prismaErrorMessage(new Error('boom'))).toBeNull();
    expect(prismaErrorMessage('boom')).toBeNull();
    expect(prismaErrorMessage(null)).toBeNull();
    expect(prismaErrorMessage(undefined)).toBeNull();
    expect(prismaErrorMessage({ code: 500 })).toBeNull();
  });

  // The browser is a public surface; the diagnosis belongs in the log.
  it('never leaks the query, the model, or the message', () => {
    for (const code of ['P2025', 'P2002', 'P2003', 'P1001']) {
      const message = prismaErrorMessage(prismaError(code))!;
      expect(message).not.toMatch(/prisma|Video|invocation|P2\d{3}/i);
    }
  });
});

describe('actionErrorMessage', () => {
  it('falls back to the generic line for anything unmapped', () => {
    expect(actionErrorMessage(new Error('connection reset'))).toBe(GENERIC_ACTION_ERROR);
    expect(actionErrorMessage(actionErrorMessage)).toBe(GENERIC_ACTION_ERROR);
  });

  it('does not repeat the thrown message back to the browser', () => {
    expect(actionErrorMessage(new Error('relation "Photo" does not exist'))).not.toMatch(
      /relation|Photo/,
    );
  });
});

describe('attempt', () => {
  it('passes a successful result straight through', async () => {
    await expect(attempt('x', async () => ({}))).resolves.toEqual({});
  });

  // Early returns are results, not throws — the wrapper must not touch them.
  it('preserves an early-return error message verbatim', async () => {
    await expect(attempt('x', async () => ({ error: 'Unauthorized' }))).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('converts a throw into the rendered contract and logs the cause', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = prismaError('P2025');

    await expect(attempt('reorderVideos', async () => ({}))).resolves.toEqual({});
    const result = await attempt('reorderVideos', async () => {
      throw cause;
    });

    expect(result).toEqual({ error: prismaErrorMessage(cause) });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('reorderVideos'), cause);
  });
});

describe('attemptOr', () => {
  it('answers with the fallback rather than rejecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const empty = { photos: [], videos: [] };

    await expect(
      attemptOr('listPostMedia', empty, async () => {
        throw new Error('down');
      }),
    ).resolves.toBe(empty);
  });
});

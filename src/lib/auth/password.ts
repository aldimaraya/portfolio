import bcrypt from 'bcryptjs';

/**
 * bcrypt is Node-only and comparatively slow by design. Import this from the
 * login route (pinned to `runtime = 'nodejs'`) and nowhere else — never from
 * proxy.ts, which runs on every /admin request.
 */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // A malformed hash in config shouldn't leak a stack trace to the client.
    return false;
  }
}

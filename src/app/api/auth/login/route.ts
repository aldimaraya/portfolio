import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authEnv } from '@/lib/env';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session';

// bcrypt is Node-only, so this route stays pinned to the Node runtime.
export const runtime = 'nodejs';

const body = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your password' }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.data.password, authEnv().ADMIN_PASSWORD_HASH);
  if (!ok) {
    return NextResponse.json({ error: 'That password is incorrect' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

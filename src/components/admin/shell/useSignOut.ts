'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    // The proxy gate sees the cleared cookie and bounces /admin to /login.
    router.push('/login');
    router.refresh();
  }

  return { busy, signOut };
}

'use client';

import { useEffect, useState } from 'react';

/**
 * An object URL for a blob, revoked when the blob changes or the component
 * goes. Made in an effect rather than a useMemo: a memoised URL revoked by an
 * effect's cleanup is dead after React's development double-run of effects —
 * the memo hands the same, now revoked, URL back — which is what left the queue's
 * scrubber black. Empty until the effect has run.
 */
export function useObjectUrl(blob: Blob | null | undefined): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) return;
    const made = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is an external resource; its lifetime is this effect's
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl('');
    };
  }, [blob]);
  return url;
}

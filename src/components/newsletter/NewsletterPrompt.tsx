'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useIsAdmin } from '@/components/site/useIsAdmin';
import {
  PROMPT_DELAY_MS,
  PROMPT_RETRY_MS,
  promptAnswered,
  promptSuppressedOn,
  rememberPromptAnswer,
} from '@/lib/newsletter/prompt';
import { SubscribeForm } from './SubscribeForm';

/**
 * The "get new work by email" prompt, shown once per browser after
 * PROMPT_DELAY_MS of browsing. Mounted in the public layout, so the clock keeps
 * running across client-side navigations instead of restarting on each page.
 *
 * A native <dialog> opened with showModal(): that is what gets focus trapping,
 * Escape to close, inert page content and the top layer for free, none of
 * which a positioned div has.
 */
export function NewsletterPrompt() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  // Read at fire time rather than captured when the timer was set: the visitor
  // has usually moved pages by then, and the admin check answers asynchronously.
  const latest = useRef({ pathname, isAdmin });
  useEffect(() => {
    latest.current = { pathname, isAdmin };
  }, [pathname, isAdmin]);

  useEffect(() => {
    // Automated browsers never subscribe, and the E2E suite runs long enough to
    // have the dialog land on top of whatever it is clicking.
    if (navigator.webdriver || promptAnswered()) return;

    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const { pathname: here, isAdmin: admin } = latest.current;
      // The admin does not need asking, and never will.
      if (admin || promptAnswered()) return;
      // Someone looking at a photo, or already on the signup page, is left
      // alone — and asked again shortly, rather than never.
      const busy = document.querySelector('[aria-modal="true"], dialog[open]') !== null;
      if (busy || promptSuppressedOn(here)) {
        timer = setTimeout(attempt, PROMPT_RETRY_MS);
        return;
      }
      setOpen(true);
    };

    timer = setTimeout(attempt, PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  function close() {
    // SubscribeForm records its own answer on success; this only covers declining.
    if (!promptAnswered()) rememberPromptAnswer('dismissed');
    dialogRef.current?.close();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="newsletter-prompt-title"
      // Escape arrives as `cancel`; route it through close() so it is remembered.
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      // Preflight zeroes every margin, which un-centres a modal dialog; m-auto
      // puts back what the browser's own stylesheet would have done.
      className="newsletter-prompt m-auto w-[calc(100%-2rem)] max-w-md rounded border border-goldline bg-film p-0 text-bone backdrop:bg-black/70"
    >
      <div className="relative p-6 sm:p-8">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 px-2 py-1 text-xl leading-none text-ash transition hover:text-bone"
        >
          ×
        </button>
        <p className="font-mono text-xs tracking-[0.2em] text-gold uppercase">Newsletter</p>
        <h2 id="newsletter-prompt-title" className="mt-2 text-xl font-semibold tracking-tight">
          Get new work by email
        </h2>
        <p className="mt-2 mb-6 text-sm leading-relaxed text-ash">
          One email when something new goes up, with a day’s uploads bundled together. Pick
          what you want to hear about.
        </p>
        <SubscribeForm onSubscribed={() => setSubscribed(true)} />
        <button
          type="button"
          onClick={close}
          className="mt-4 text-xs text-ash underline-offset-4 transition hover:text-bone hover:underline"
        >
          {subscribed ? 'Close' : 'No thanks'}
        </button>
      </div>
    </dialog>
  );
}

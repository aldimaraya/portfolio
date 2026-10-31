'use client';

import { useId, useState } from 'react';
import { LABEL } from '../fields';
import { useStoredPreference } from '../useStoredPreference';

export interface PreviewOption {
  key: string;
  label: string;
  count: number;
  /** Null when these choices get nothing from this batch. */
  email: { subject: string; html: string } | null;
}

/**
 * The next email as each kind of subscriber gets it. Subscribers differ only in
 * what they ticked, so these few previews are every email the batch will send.
 *
 * A full-width row that folds to its header: the email is tall, and once it has
 * been looked at it only pushes Subscribers down. Folded, the header still says
 * the subject and who it reaches. Open or folded is remembered per device.
 */
export function PreviewAs({
  options,
  confirmed,
  reach,
}: {
  options: PreviewOption[];
  confirmed: number;
  reach: number;
}) {
  const [selected, setSelected] = useState(options[0].key);
  const [openPref, setOpenPref] = useStoredPreference('admin.newsletter.preview', 'open');
  const open = openPref === 'open';
  const body = useId();
  const option = options.find((candidate) => candidate.key === selected) ?? options[0];
  const skipped = confirmed - reach;

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-film">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 md:px-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => setOpenPref(open ? 'closed' : 'open')}
          className="-my-1 flex min-h-11 min-w-0 flex-[1_1_320px] items-center gap-3 text-left"
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`shrink-0 text-ash transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={LABEL}>Preview</span>
            <span className="truncate text-sm">
              {option.email ? option.email.subject : `${option.label}: nothing this time`}
            </span>
            <span className="text-xs text-ash">
              To {reach} of {confirmed}
              {skipped > 0 ? ` · the other ${skipped} get nothing they chose, so they are skipped` : ''}
            </span>
          </span>
        </button>
        {open && options.length > 1 ? (
          <div
            role="group"
            aria-label="Preview as"
            className="flex flex-wrap gap-1 rounded-lg border border-hairline bg-frame p-[3px] md:ml-auto"
          >
            {options.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                aria-pressed={candidate.key === option.key}
                onClick={() => setSelected(candidate.key)}
                className={`h-7 rounded-md px-2.5 text-xs transition-colors ${
                  candidate.key === option.key ? 'bg-film text-bone' : 'text-ash hover:text-bone'
                }`}
              >
                {candidate.label} · {candidate.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {open ? (
        <div id={body} className="border-t border-hairline">
          {option.email ? (
            // sandbox with no allowances: the email is inert markup here, no
            // scripts, no navigation out of the admin.
            <iframe
              key={option.key}
              title={`Email preview: ${option.label}`}
              sandbox=""
              srcDoc={option.email.html}
              className="block h-[640px] w-full bg-white"
            />
          ) : (
            <p className="px-4 py-10 text-center text-sm text-ash">
              Nothing in this batch is something they chose, so they get no email this time.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

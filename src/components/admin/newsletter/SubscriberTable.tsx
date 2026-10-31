'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { confirmSubscriber, removeSubscriber } from '@/app/admin/newsletter/actions';
import { CONTENT_KINDS, KIND_LABELS } from '@/lib/newsletter/kinds';
import { DeleteButton } from '../DeleteButton';
import { LABEL } from '../fields';
import { Icon } from '../shell/Icon';
import { LocalTime } from './LocalTime';

export interface SubscriberRow {
  id: string;
  email: string;
  confirmedAt: string | null;
  createdAt: string;
  journal: boolean;
  motion: boolean;
  stills: boolean;
}

type View = 'confirmed' | 'unconfirmed';

/** Stills first, as the email and the rest of this page order the kinds. */
const KIND_ORDER = [...CONTENT_KINDS].reverse();

const CHIP = 'h-7 shrink-0 rounded-full border px-2.5 text-xs transition';

export function SubscriberTable({ subscribers }: { subscribers: SubscriberRow[] }) {
  const confirmed = subscribers.filter((subscriber) => subscriber.confirmedAt);
  const unconfirmed = subscribers.filter((subscriber) => !subscriber.confirmedAt);
  // Opens on the unconfirmed ones only when they are all there is to see.
  const [view, setView] = useState<View>(confirmed.length || !unconfirmed.length ? 'confirmed' : 'unconfirmed');
  const [query, setQuery] = useState('');

  const pool = view === 'confirmed' ? confirmed : unconfirmed;
  const needle = query.trim().toLowerCase();
  const shown = needle ? pool.filter((subscriber) => subscriber.email.toLowerCase().includes(needle)) : pool;

  return (
    <section className="min-w-0 flex-[2_1_520px] overflow-hidden rounded-xl border border-hairline bg-film">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline px-4 py-3 md:px-5">
        <h2 className={LABEL}>Subscribers</h2>
        <div role="group" aria-label="Show" className="flex gap-1.5">
          <button
            type="button"
            aria-pressed={view === 'confirmed'}
            onClick={() => setView('confirmed')}
            className={`${CHIP} ${view === 'confirmed' ? 'border-gold bg-gold/10 text-gold' : 'border-white/15 text-[#d0d0d4] hover:border-white/40'}`}
          >
            Confirmed {confirmed.length}
          </button>
          <button
            type="button"
            aria-pressed={view === 'unconfirmed'}
            onClick={() => setView('unconfirmed')}
            className={`${CHIP} ${view === 'unconfirmed' ? 'border-gold bg-gold/10 text-gold' : 'border-white/15 text-[#d0d0d4] hover:border-white/40'}`}
          >
            Unconfirmed{' '}
            <span className={unconfirmed.length && view !== 'unconfirmed' ? 'text-amber-400' : ''}>
              {unconfirmed.length}
            </span>
          </button>
        </div>
        <label className="flex h-8 min-w-0 flex-[1_1_200px] items-center gap-2 rounded-md border border-hairline bg-frame px-2.5 text-ash sm:ml-auto sm:max-w-60">
          <Icon name="search" size={14} />
          <span className="sr-only">Find a subscriber</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an address"
            className="min-w-0 flex-1 bg-transparent text-sm text-bone outline-none placeholder:text-ash"
          />
        </label>
      </div>

      {shown.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] text-ash">
                <th scope="col" className="px-4 py-2.5 font-normal md:px-5">
                  Address
                </th>
                <th scope="col" className="w-px px-2 py-2.5 font-normal">
                  Gets
                </th>
                <th scope="col" className="w-px px-2 py-2.5 font-normal whitespace-nowrap">
                  {view === 'confirmed' ? 'Joined' : 'Signed up'}
                </th>
                <th scope="col" className="w-px px-4 py-2.5 md:px-5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((subscriber) => (
                <tr key={subscriber.id} className="border-t border-white/6">
                  {/* max-w-0 with the other columns at w-px: Address takes every spare pixel
                      and only truncates once the table is at its minimum width. */}
                  <td
                    title={subscriber.email}
                    className={`max-w-0 truncate px-4 py-2.5 md:px-5 ${subscriber.confirmedAt ? '' : 'text-ash'}`}
                  >
                    {subscriber.email}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <div className="flex gap-1">
                      {KIND_ORDER.filter((kind) => subscriber[kind]).map((kind) => (
                        <span
                          key={kind}
                          className="flex h-5.5 items-center rounded-sm bg-[#2a2a30] px-1.5 text-[11px] text-[#d0d0d4]"
                        >
                          {KIND_LABELS[kind].label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 pr-6 whitespace-nowrap text-ash">
                    <LocalTime value={subscriber.confirmedAt ?? subscriber.createdAt} format="day" />
                  </td>
                  <td className="px-4 py-2.5 md:px-5">
                    <div className="flex items-center justify-end gap-4">
                      {subscriber.confirmedAt ? null : <ConfirmSubscriber id={subscriber.id} />}
                      <DeleteButton
                        id={subscriber.id}
                        action={removeSubscriber}
                        redirectTo="/admin/newsletter"
                        label="Remove"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-sm text-ash md:px-5">
          {needle ? 'No address matches.' : view === 'confirmed' ? 'No one yet.' : 'Every signup is confirmed.'}
        </p>
      )}

      <div className="border-t border-white/6 px-4 py-3 text-xs text-ash md:px-5">
        {shown.length < pool.length ? `Showing ${shown.length} of ${pool.length} · ` : ''}
        Unconfirmed addresses are deleted after a week
      </div>
    </section>
  );
}

/**
 * Confirms a signup by hand, for someone known to want it who never clicked the
 * link. One click, no second step: unlike Remove, it is undone by removing them.
 */
function ConfirmSubscriber({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    const result = await confirmSubscriber(id);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="text-sm text-gold transition hover:text-bone disabled:opacity-50"
      >
        {busy ? 'Confirming…' : 'Confirm'}
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}

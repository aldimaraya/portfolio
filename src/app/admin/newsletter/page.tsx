import { AdminPage } from '@/components/admin/shell/AdminPage';
import { db } from '@/lib/db';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { LABEL } from '@/components/admin/fields';
import { BatchActions, ConfirmSubscriber, LocalTime, SkipToggle } from '@/components/admin/NewsletterControls';
import { CONTENT_KINDS, KIND_LABELS, type ContentKind } from '@/lib/newsletter/kinds';
import { pendingBatch, renderPendingPreview, skippedItems } from '@/lib/newsletter/queue';
import { estimatedSendTime, QUIET_HOURS } from '@/lib/newsletter/schedule';
import { emailConfigured, isProductionDeployment, testRecipients } from '@/lib/newsletter/send';
import { removeSubscriber } from './actions';

export const dynamic = 'force-dynamic';

const ITEMS_SHOWN_OPEN = 5;

/** "14 stills · 2 motion" — the folded queue's one line. */
function kindCounts(items: { kind: ContentKind }[]): string {
  return CONTENT_KINDS.map((kind) => [kind, items.filter((item) => item.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${KIND_LABELS[kind].label.toLowerCase()}`)
    .join(' · ');
}

export default async function AdminNewsletterPage() {
  const [batch, skipped, preview, unfinished, history, subscribers] = await Promise.all([
    pendingBatch(),
    skippedItems(),
    renderPendingPreview(),
    db.dispatch.findFirst({ where: { completedAt: null }, select: { createdAt: true, sent: true } }),
    db.dispatch.findMany({
      where: { completedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, completedAt: true, sent: true, _count: { select: { announcements: true } } },
    }),
    db.subscriber.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, confirmedAt: true, journal: true, motion: true, stills: true, createdAt: true },
    }),
  ]);

  const configured = emailConfigured();
  const production = isProductionDeployment();
  const canPreview = configured && testRecipients().length > 0;
  const live = batch.items.filter((item) => item.state === 'live');
  const confirmed = subscribers.filter((subscriber) => subscriber.confirmedAt);

  return (
    <AdminPage title="Newsletter">
      <div className="flex flex-col gap-10">
        {!configured || !production ? (
          <div className="rounded border border-goldline bg-frame p-4 text-sm leading-relaxed text-ash">
            {!configured ? (
              <p>
                Email isn’t configured here: set <code className="text-bone">RESEND_API_KEY</code> and{' '}
                <code className="text-bone">EMAIL_FROM</code>. Items are still queued as you publish.
              </p>
            ) : null}
            {!production ? (
              <p>
                This isn’t the production deployment, so nothing goes to subscribers from here — only
                previews to <code className="text-bone">NEWSLETTER_TEST_EMAIL</code>
                {testRecipients().length ? '' : ' (not set)'}.
              </p>
            ) : null}
          </div>
        ) : null}

        {unfinished ? (
          <p className="rounded border border-red-400/40 p-4 text-sm text-red-300">
            A send that started <LocalTime value={unfinished.createdAt.toISOString()} /> stopped after{' '}
            {unfinished.sent} emails. The next daily run finishes it, or use Send now.
          </p>
        ) : null}

        <section>
          <h2 className={`mb-1 ${LABEL}`}>Next email ({live.length} item{live.length === 1 ? '' : 's'})</h2>
          <p className="mb-4 text-sm text-ash">
            {batch.newest ? (
              <>
                Goes out once nothing new has been added for {QUIET_HOURS} hours — around{' '}
                <LocalTime value={estimatedSendTime(batch.newest).toISOString()} />.
              </>
            ) : (
              'Nothing new since the last email. Publishing a post, clip or photo adds it here.'
            )}
          </p>

          {/* The preview below already shows the batch, so the list is only for
              leaving things out: folded to a count when long, so a day of uploads
              does not push the preview a screen down. It stays open when short or
              when an item needs a look. */}
          {batch.items.length ? (
            <details
              className="mb-5"
              open={batch.items.length <= ITEMS_SHOWN_OPEN || batch.items.some((item) => item.state !== 'live')}
            >
              <summary className="cursor-pointer text-sm text-ash">{kindCounts(batch.items)} — choose what to leave out</summary>
              <ul className="mt-2 flex flex-col divide-y divide-hairline">
                {batch.items.map((item) => (
                  <li key={item.announcementId} className="flex items-center gap-4 py-1.5">
                    <span className="w-16 shrink-0 font-mono text-xs text-ash uppercase">
                      {KIND_LABELS[item.kind].label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title || 'Untitled'}</span>
                    <span className="hidden shrink-0 font-mono text-xs text-ash sm:inline">
                      {item.state === 'held'
                        ? 'Back in draft — waits until republished'
                        : item.state === 'missing'
                          ? 'Deleted — dropped on the next run'
                          : <LocalTime value={item.createdAt.toISOString()} />}
                    </span>
                    {item.state === 'missing' ? null : <SkipToggle id={item.announcementId} skipped={false} />}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <BatchActions pending={live.length} canPreview={canPreview} />

          {skipped.length ? (
            <details className="mt-6">
              <summary className="text-sm text-ash">Left out ({skipped.length})</summary>
              <ul className="mt-2 flex flex-col divide-y divide-hairline">
                {skipped.map((item) => (
                  <li key={item.announcementId} className="flex items-center gap-4 py-2">
                    <span className="w-16 shrink-0 font-mono text-xs text-ash uppercase">
                      {KIND_LABELS[item.kind].label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ash">{item.title || 'Untitled'}</span>
                    <SkipToggle id={item.announcementId} skipped />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        {preview ? (
          <section>
            <h2 className={`mb-1 ${LABEL}`}>Preview</h2>
            <p className="mb-3 text-sm text-ash">
              As someone subscribed to everything will see it. Subject: <span className="text-bone">{preview.subject}</span>
            </p>
            {/* sandbox with no allowances: the email is inert markup here, no
                scripts, no navigation out of the admin. */}
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.html}
              className="h-[640px] w-full rounded border border-hairline bg-white"
            />
          </section>
        ) : null}

        <section>
          <h2 className={`mb-4 ${LABEL}`}>
            Subscribers ({confirmed.length} confirmed
            {subscribers.length > confirmed.length ? `, ${subscribers.length - confirmed.length} unconfirmed` : ''})
          </h2>
          {subscribers.length ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {subscribers.map((subscriber) => (
                <li key={subscriber.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm ${subscriber.confirmedAt ? '' : 'text-ash'}`}>
                      {subscriber.email}
                    </div>
                    <div className="font-mono text-xs text-ash">
                      {subscriber.confirmedAt ? (
                        (['journal', 'motion', 'stills'] as const)
                          .filter((kind) => subscriber[kind])
                          .map((kind) => KIND_LABELS[kind].label)
                          .join(' · ')
                      ) : (
                        'Unconfirmed — deleted after a week'
                      )}
                    </div>
                  </div>
                  {subscriber.confirmedAt ? null : <ConfirmSubscriber id={subscriber.id} />}
                  <DeleteButton
                    id={subscriber.id}
                    action={removeSubscriber}
                    redirectTo="/admin/newsletter"
                    label="Remove"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ash">No one yet.</p>
          )}
        </section>

        {history.length ? (
          <section>
            <h2 className={`mb-4 ${LABEL}`}>Sent</h2>
            <ul className="flex flex-col divide-y divide-hairline">
              {history.map((dispatch) => (
                <li key={dispatch.id} className="flex gap-4 py-2 text-sm">
                  <span className="w-44 shrink-0 text-ash">
                    {dispatch.completedAt ? <LocalTime value={dispatch.completedAt.toISOString()} /> : null}
                  </span>
                  <span>
                    {dispatch._count.announcements} item{dispatch._count.announcements === 1 ? '' : 's'} ·{' '}
                    {dispatch.sent} email{dispatch.sent === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AdminPage>
  );
}

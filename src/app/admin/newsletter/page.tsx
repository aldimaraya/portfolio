import { AdminPage } from '@/components/admin/shell/AdminPage';
import { LABEL } from '@/components/admin/fields';
import { BatchQueue, type QueueItem } from '@/components/admin/newsletter/BatchQueue';
import { NoteField } from '@/components/admin/newsletter/NoteField';
import { LocalTime } from '@/components/admin/newsletter/LocalTime';
import { PreviewAs } from '@/components/admin/newsletter/PreviewAs';
import { SendActions } from '@/components/admin/newsletter/SendActions';
import { SubscriberTable } from '@/components/admin/newsletter/SubscriberTable';
import { batchSummary, countOf, countsSummary } from '@/lib/admin/overview';
import { db } from '@/lib/db';
import { preferenceGroups, reach } from '@/lib/newsletter/audience';
import type { ContentKind } from '@/lib/newsletter/kinds';
import { loadDraft, pendingBatch, renderPreviews, skippedItems, type BatchItem } from '@/lib/newsletter/queue';
import { estimatedSendTime, QUIET_HOURS, quietHours } from '@/lib/newsletter/schedule';
import { emailConfigured, isProductionDeployment, testRecipients } from '@/lib/newsletter/send';

export const dynamic = 'force-dynamic';

const HISTORY = 10;

const toQueueItem = (item: BatchItem): QueueItem => ({
  id: item.announcementId,
  kind: item.kind,
  title: item.title,
  at: item.createdAt.toISOString(),
  state: item.state,
  thumb: item.thumb,
  roll: item.roll,
});

export default async function AdminNewsletterPage() {
  const [batch, draft, skipped, unfinished, history, subscribers] = await Promise.all([
    pendingBatch(),
    loadDraft(),
    skippedItems(),
    db.dispatch.findFirst({
      where: { completedAt: null },
      select: { createdAt: true, sent: true },
    }),
    db.dispatch.findMany({
      where: { completedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY,
      select: { id: true, completedAt: true, sent: true, message: true },
    }),
    db.subscriber.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        confirmedAt: true,
        journal: true,
        motion: true,
        stills: true,
        createdAt: true,
      },
    }),
  ]);

  // What each sent email held, for "9 stills · 1 post". One grouped count
  // rather than the announcements themselves, which can run to hundreds.
  const sentKinds = history.length
    ? await db.announcement.groupBy({
        by: ['dispatchId', 'kind'],
        where: { dispatchId: { in: history.map((dispatch) => dispatch.id) } },
        _count: { _all: true },
      })
    : [];
  const kindsOf = (dispatchId: string) => {
    const counts: Partial<Record<ContentKind, number>> = {};
    for (const row of sentKinds) if (row.dispatchId === dispatchId) counts[row.kind] = row._count._all;
    return countsSummary(counts);
  };

  const configured = emailConfigured();
  const production = isProductionDeployment();
  const canPreview = configured && testRecipients().length > 0;
  const live = batch.items.filter((item) => item.state === 'live');
  const confirmed = subscribers.filter((subscriber) => subscriber.confirmedAt);

  const groups = preferenceGroups(confirmed);
  const previews = live.length
    ? await renderPreviews(
        batch.content,
        draft,
        groups.map((group) => group.prefs),
      )
    : [];
  // The queue laid out as the email is: sections in the chosen order, empty
  // ones left out, items already in their places from pendingBatch.
  const sections = draft.sections
    .map((kind) => ({ kind, items: batch.items.filter((item) => item.kind === kind).map(toQueueItem) }))
    .filter((section) => section.items.length);
  const reached = reach(batch.content, groups);

  const now = new Date();
  const quiet = batch.newest ? quietHours(batch.newest, now) : 0;

  return (
    <AdminPage
      title="Newsletter"
      count={countOf(confirmed.length, ['subscriber', 'subscribers'])}
      actions={
        <>
          <p className="flex w-full items-center gap-2 text-xs text-ash md:order-last md:basis-full">
            <span
              aria-hidden="true"
              className={`size-1.75 shrink-0 rounded-full ${
                !configured ? 'bg-red-400' : production ? 'bg-[#7fc49a]' : 'bg-amber-400'
              }`}
            />
            {!configured
              ? 'Email isn’t configured here — items still queue as you publish'
              : production
                ? 'Sending from production · email configured'
                : 'Not production — nothing goes to subscribers from here, only tests'}
          </p>
          <SendActions
            pending={live.length}
            recipients={reached}
            canSend={configured && production}
            canPreview={canPreview}
            resuming={Boolean(unfinished)}
          />
        </>
      }
    >
      <div className="flex flex-col gap-7">
        {!configured || !production ? (
          <div className="rounded-xl border border-goldline bg-film p-4 text-sm leading-relaxed text-ash md:px-5">
            {!configured ? (
              <p>
                Set <code className="text-bone">RESEND_API_KEY</code> and <code className="text-bone">EMAIL_FROM</code>{' '}
                to send from here.
              </p>
            ) : null}
            {!production ? (
              <p>
                Tests go to <code className="text-bone">NEWSLETTER_TEST_EMAIL</code>
                {testRecipients().length ? '' : ' (not set)'}. Sending from here would spend the batch without
                delivering it, since this deployment shares production’s database.
              </p>
            ) : null}
          </div>
        ) : null}

        {unfinished ? (
          <p role="alert" className="rounded-xl border border-red-400/40 p-4 text-sm text-red-300 md:px-5">
            A send that started <LocalTime value={unfinished.createdAt.toISOString()} /> stopped after{' '}
            {countOf(unfinished.sent, ['email', 'emails'])}. The next daily run finishes it, or use Finish sending.
          </p>
        ) : null}

        {/* Each row its own height: the preview used to sit beside the queue, and
            its height left a hole under a short queue. */}
        <section className="overflow-hidden rounded-xl border border-gold/30 bg-film">
          <div className="flex flex-col gap-1.5 border-b border-hairline px-4 py-4 md:px-5">
            <h2 className={`${LABEL} text-gold`}>Next email</h2>
            {batch.newest ? (
              <>
                <span className="text-lg">{batchSummary(live)}</span>
                <span className="text-sm text-ash">
                  Goes out once nothing new is added for {QUIET_HOURS} hours — around{' '}
                  <span className="text-bone">
                    <LocalTime value={estimatedSendTime(batch.newest).toISOString()} />
                  </span>
                  . Adding more pushes it back.
                </span>
                {/* How far through the quiet spell the batch is. Full means it is
                      only waiting on the daily run. */}
                <div
                  role="progressbar"
                  aria-label="Quiet so far"
                  aria-valuemin={0}
                  aria-valuemax={QUIET_HOURS}
                  aria-valuenow={quiet}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-frame"
                >
                  <div className="h-full rounded-full bg-gold" style={{ width: `${(quiet / QUIET_HOURS) * 100}%` }} />
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 text-[11px] text-ash">
                  <span>
                    Last added <LocalTime value={batch.newest.toISOString()} />
                  </span>
                  <span>
                    {quiet >= QUIET_HOURS
                      ? 'Quiet — waiting for the daily run'
                      : `Quiet for ${quiet} of ${QUIET_HOURS} h`}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-sm text-ash">
                Nothing new since the last email. Publishing a post, clip or still adds it here.
              </span>
            )}
          </div>
          <NoteField initial={draft.message} />
          <BatchQueue sections={sections} order={draft.sections} skipped={skipped.map(toQueueItem)} />
        </section>

        {live.length ? (
          <PreviewAs
            options={groups.map((group, i) => ({
              key: group.key,
              label: group.label,
              count: group.count,
              email: previews[i] ? { subject: previews[i].subject, html: previews[i].html } : null,
            }))}
            confirmed={confirmed.length}
            reach={reached}
          />
        ) : null}

        {/* Subscribers and history share a row: history is short, the list can be long. */}
        <div className="flex flex-wrap items-start gap-6">
          <SubscriberTable
            subscribers={subscribers.map((subscriber) => ({
              ...subscriber,
              confirmedAt: subscriber.confirmedAt?.toISOString() ?? null,
              createdAt: subscriber.createdAt.toISOString(),
            }))}
          />

          <section className="min-w-0 flex-[1_1_300px] overflow-hidden rounded-xl border border-hairline bg-film">
            <h2 className={`border-b border-hairline px-4 py-3.5 md:px-5 ${LABEL}`}>Sent</h2>
            {history.length ? (
              <ol className="flex flex-col py-1.5">
                {history.map((dispatch) => (
                  <li
                    key={dispatch.id}
                    className="flex min-h-12 items-center gap-3 border-b border-white/6 px-4 py-2 last:border-b-0 md:px-5"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm">
                        {dispatch.completedAt ? <LocalTime value={dispatch.completedAt.toISOString()} /> : null}
                      </span>
                      <span className="truncate text-xs text-ash">
                        {kindsOf(dispatch.id) || '—'}
                        {dispatch.message ? ' · with a note' : ''}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-[#b4b4ba] tabular-nums">
                      {countOf(dispatch.sent, ['email', 'emails'])}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-5 text-sm text-ash md:px-5">Nothing sent yet.</p>
            )}
            <p className="border-t border-white/6 px-4 py-3 text-xs text-ash md:px-5">
              Counts are emails handed to the provider, not opens — nothing in an email tracks its reader.
            </p>
          </section>
        </div>
      </div>
    </AdminPage>
  );
}

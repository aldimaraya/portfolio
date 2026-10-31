import Image from 'next/image';
import Link from 'next/link';
import { AdminPage } from '@/components/admin/shell/AdminPage';
import { Icon } from '@/components/admin/shell/Icon';
import { LABEL } from '@/components/admin/fields';
import { VisitorBars } from '@/components/admin/VisitorBars';
import {
  RANGES,
  SURFACES,
  change,
  engagementHref,
  likeRate,
  loadEngagement,
  parseEngagementQuery,
  type TopItem,
} from '@/lib/admin/engagement';
import { countOf } from '@/lib/admin/overview';
import { placeholderColor } from '@/lib/color/analyze';
import { CONTENT_KINDS, KIND_LABELS } from '@/lib/newsletter/kinds';
import { OPEN_PHOTO_PARAM } from '@/lib/photo/lightbox-link';
import { adminClipHref } from '@/lib/video/edit-link';

// Counts must reflect the database on every visit, never a build-time snapshot.
export const dynamic = 'force-dynamic';

const START_LABEL = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  // Views are stored by UTC day, so the range is labelled in UTC too.
  timeZone: 'UTC',
});

export default async function AdminEngagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseEngagementQuery(await searchParams);
  const data = await loadEngagement(query);
  const { days, surface, sort } = query;
  const range = `last ${days} days`;
  const peak = Math.max(...data.daily, 0);
  const anySent = data.sends.some(Boolean);
  const maxLikes = Math.max(...Object.values(data.likesBySurface), 1);

  return (
    <AdminPage
      title="Engagement"
      actions={
        <div className="flex flex-wrap gap-2.5 md:ml-auto">
          <Segments
            label="Surface"
            options={SURFACES.map((option) => ({
              label: option.label,
              href: engagementHref({ ...query, surface: option.key }),
              on: option.key === surface,
            }))}
          />
          <Segments
            label="Range"
            options={RANGES.map((option) => ({
              label: `${option} days`,
              href: engagementHref({ ...query, days: option }),
              on: option === days,
            }))}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Views" pair={data.views} days={days} />
          <Stat label="Visitor-days" pair={data.visitors} days={days} />
          <Stat label="Likes" pair={data.likes} days={days} />
          <Stat label="New subscribers" pair={data.subscribers} days={days} />
        </dl>

        <section className="flex flex-col gap-3.5 rounded-xl border border-hairline bg-film p-4 md:p-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className={LABEL}>Visitors per day</h2>
            {anySent ? <span className="text-xs text-ash">Gold ticks mark a newsletter going out</span> : null}
            <span className="ml-auto text-xs text-ash">
              Peak <span className="text-bone tabular-nums">{countOf(peak, ['visitor', 'visitors'])}</span>
            </span>
          </div>
          {/* The top padding is room for the send ticks above the tallest bar. */}
          <VisitorBars daily={data.daily} start={data.start} marks={data.sends} className="h-44 pt-3.5" />
          <span className="flex justify-between text-[11px] text-ash" aria-hidden="true">
            <span>{START_LABEL.format(data.start)}</span>
            <span>Today</span>
          </span>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-hairline bg-film">
            <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3 md:px-5">
              <h2 className={LABEL}>Top · {range}</h2>
              <Segments
                label="Rank by"
                className="ml-auto"
                options={(['likes', 'views'] as const).map((option) => ({
                  label: `By ${option}`,
                  href: engagementHref({ ...query, sort: option }),
                  on: option === sort,
                }))}
              />
            </div>
            {data.top.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-ash">
                      <th scope="col" className="px-4 py-2.5 font-normal md:px-5">
                        Item
                      </th>
                      <th scope="col" className="px-2 py-2.5 text-right font-normal">
                        Views
                      </th>
                      <th scope="col" className="px-2 py-2.5 text-right font-normal">
                        Likes
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-normal md:px-5">
                        Liked by
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top.map((item) => (
                      <TopRow key={item.kind + item.id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-5 text-sm text-ash md:px-5">
                Nothing {sort === 'likes' ? 'liked' : 'viewed'} in the {range}.
              </p>
            )}
            <p className="border-t border-white/6 px-4 py-3 text-xs text-ash md:px-5">
              A still’s view is the lightbox resting on it for a second, and only you see the count — the public
              lightbox shows likes alone. “Liked by” is likes per hundred views.
            </p>
          </section>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-3.5 rounded-xl border border-hairline bg-film p-4 md:p-5">
              <h2 className={LABEL}>Likes by surface</h2>
              {/* Stills first, as everywhere the three are listed together. */}
              {[...CONTENT_KINDS].reverse().map((kind) => {
                const likes = data.likesBySurface[kind];
                const lit = surface === 'all' || surface === kind;
                return (
                  <div key={kind} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm">
                      <span>{KIND_LABELS[kind].label}</span>
                      <span className="text-[#b4b4ba] tabular-nums">{countOf(likes, ['like', 'likes'])}</span>
                    </div>
                    <div className="h-2 rounded-full bg-frame">
                      <div
                        className={`h-2 rounded-full ${lit ? 'bg-gold' : 'bg-white/20'}`}
                        style={{ width: `${(likes / maxLikes) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="flex flex-col gap-2.5 rounded-xl border border-hairline bg-film p-4 md:p-5">
              <h2 className={LABEL}>What is counted</h2>
              <ul className="flex list-disc flex-col gap-2 pl-4 text-xs leading-relaxed text-[#b4b4ba]">
                <li>
                  A view is one visitor, one item, one day: a clip or post opened, or a still held in the lightbox for
                  a second. Only the live site counts — never previews, never you.
                </li>
                <li>
                  Visitors are counted per day and summed: nothing ties one day’s visitor to the next, so this is
                  visitor-days, not people.
                </li>
                <li>Nothing here can name a visitor. Only hashes are stored.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}

/**
 * A segmented control made of links: each choice is a URL, so a view of the
 * page can be bookmarked or sent, and the server renders it without a client
 * round trip. `aria-current` marks the choice in force.
 */
function Segments({
  label,
  options,
  className = '',
}: {
  label: string;
  options: { label: string; href: string; on: boolean }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`flex gap-1 rounded-lg border border-hairline bg-film p-[3px] ${className}`}>
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.on ? 'true' : undefined}
          // A view change is a new render on the server; scrolling to the top
          // would lose the reader's place in the table they are re-sorting.
          scroll={false}
          className={`flex h-7 items-center rounded-md px-2.5 text-xs transition-colors ${
            option.on ? 'bg-frame text-bone' : 'text-ash hover:text-bone'
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * One number, and what it was in the same number of days just before — said
 * outright on every card, since a bare "−33%" left open what it was against.
 */
function Stat({ label, pair, days }: { label: string; pair: { now: number; before: number }; days: number }) {
  const delta = change(pair.now, pair.before);
  const up = delta?.startsWith('+');
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-film px-4 py-3.5 md:px-[18px] md:py-4">
      {/* The label comes first for a screen reader, the number first on screen. */}
      <dt className="order-2 text-xs text-ash">{label}</dt>
      <dd className="order-1 text-2xl tabular-nums md:text-[26px]">{pair.now.toLocaleString('en')}</dd>
      <dd className="order-3 text-xs text-ash">
        {delta ? (
          <span className={`mr-1 tabular-nums ${up ? 'text-[#7fc49a]' : 'text-[#b4b4ba]'}`}>{delta}</span>
        ) : null}
        {delta ? 'vs ' : ''}
        <span className="tabular-nums">{pair.before.toLocaleString('en')}</span> in the previous {days} days
      </dd>
    </div>
  );
}

function hrefFor(item: TopItem): string {
  switch (item.kind) {
    case 'stills':
      return `/admin/photos?${OPEN_PHOTO_PARAM}=${encodeURIComponent(item.id)}`;
    case 'motion':
      return adminClipHref(item.id);
    case 'journal':
      return `/admin/posts/${item.id}`;
  }
}

function TopRow({ item }: { item: TopItem }) {
  const rate = likeRate(item.likes, item.views);
  return (
    <tr className="border-t border-white/6">
      <td className="px-4 py-2 md:px-5">
        <Link href={hrefFor(item)} className="group flex items-center gap-3">
          <Thumb item={item} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate group-hover:text-gold">{item.title || 'Untitled'}</span>
            <span className="truncate text-[11px] text-ash">{item.detail}</span>
          </span>
        </Link>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{item.views.toLocaleString('en')}</td>
      <td className="px-2 py-2 text-right tabular-nums">{item.likes.toLocaleString('en')}</td>
      <td className="px-4 py-2 text-right text-[#b4b4ba] tabular-nums md:px-5">{rate ?? '—'}</td>
    </tr>
  );
}

/**
 * A still goes through next/image, as on the Overview's Recently added: its
 * stored file is the full-size original, far too heavy for ten 48px boxes. Its
 * average colour stands in while it loads. A clip's poster is already small, so
 * it is a plain <img>, as on the Motion board.
 */
function Thumb({ item }: { item: TopItem }) {
  const box = 'relative h-8 w-12 shrink-0 overflow-hidden rounded-xs';
  if (item.swatch && item.image) {
    return (
      <span aria-hidden="true" className={box} style={{ backgroundColor: placeholderColor(item.swatch) }}>
        <Image src={item.image} alt="" fill sizes="48px" className="object-cover" />
      </span>
    );
  }
  if (item.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.image} alt="" className={`${box} bg-black object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${box} flex items-center justify-center border border-white/20 text-ash`}>
      <Icon name="journal" size={14} />
    </span>
  );
}

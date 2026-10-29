import Image from "next/image";
import Link from "next/link";
import { AdminPage } from "@/components/admin/shell/AdminPage";
import { Icon, type IconName } from "@/components/admin/shell/Icon";
import { ADD_MEDIA_HREF } from "@/components/admin/shell/nav";
import { GHOST_BUTTON, LABEL } from "@/components/admin/fields";
import { LocalTime } from "@/components/admin/NewsletterControls";
import { NewPostButton } from "@/components/admin/NewPostButton";
import { placeholderColor } from "@/lib/color/analyze";
import { db } from "@/lib/db";
import { attentionCount, loadAdminCounts } from "@/lib/admin/counts";
import {
  batchSummary,
  countOf,
  loadWeekEngagement,
  weekStartDay,
} from "@/lib/admin/overview";
import { OPEN_PHOTO_PARAM } from "@/lib/photo/lightbox-link";
import { pendingBatch } from "@/lib/newsletter/queue";
import { estimatedSendTime } from "@/lib/newsletter/schedule";

// Counts must reflect the database on every visit, never a build-time snapshot.
export const dynamic = "force-dynamic";

const RECENT = 8;
const RECENT_HEIGHT = 100;

const colourSelect = {
  id: true,
  avgHue: true,
  avgChroma: true,
  avgLightness: true,
} as const;

type Swatch = {
  id: string;
  avgHue: number;
  avgChroma: number;
  avgLightness: number;
};

/**
 * One row of "Needs attention". Every row is a way into the filtered view that
 * fixes it rather than a report, so the whole row is the link; the action word
 * beside it only says where it goes.
 */
type Attention = {
  href: string;
  text: string;
  note: string;
  action: string;
  /** Gold for things only a person can fix; drafts are work in progress, so they stay grey. */
  urgent: boolean;
  swatches?: Swatch[];
  icon?: IconName;
};

export default async function AdminOverview() {
  const [
    counts,
    undated,
    untagged,
    latestDraft,
    unfinished,
    batch,
    week,
    recent,
  ] = await Promise.all([
    loadAdminCounts(),
    db.photo.findMany({
      where: { takenAt: null },
      select: colourSelect,
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    db.photo.findMany({
      where: { tags: { none: {} } },
      select: colourSelect,
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    db.blogPost.findFirst({
      where: { draft: true },
      select: { id: true, title: true },
      orderBy: { publishedAt: "desc" },
    }),
    db.dispatch.findFirst({
      where: { completedAt: null },
      select: { sent: true },
    }),
    pendingBatch(),
    loadWeekEngagement(),
    db.photo.findMany({
      select: { ...colourSelect, imageUrl: true, width: true, height: true },
      orderBy: { createdAt: "desc" },
      take: RECENT,
    }),
  ]);

  const rows: Attention[] = [];
  if (unfinished) {
    rows.push({
      href: "/admin/newsletter",
      text: "A newsletter send stopped partway",
      note: `${countOf(unfinished.sent, ["email", "emails"])} went out before it stopped. The next daily run finishes it.`,
      action: "Look",
      urgent: true,
      icon: "newsletter",
    });
  }
  if (counts.undated) {
    rows.push({
      href: "/admin/photos?filter=undated",
      text: `${countOf(counts.undated, ["still has", "stills have"])} no date`,
      note: "EXIF is stripped before upload, so the date can only be typed in",
      action: "Fix them",
      urgent: true,
      swatches: undated,
    });
  }
  if (counts.untagged) {
    rows.push({
      href: "/admin/photos?filter=untagged",
      text: `${countOf(counts.untagged, ["still", "stills"])} untagged`,
      note: "They never turn up under a tag filter on the wall",
      action: "Show them",
      urgent: true,
      swatches: untagged,
    });
  }
  if (counts.unfiled) {
    rows.push({
      href: "/admin/videos",
      text: `${countOf(counts.unfiled, ["clip isn’t", "clips aren’t"])} on a roll`,
      note: "Shown under the first roll on /motion until filed",
      action: "File",
      urgent: true,
      icon: "motion",
    });
  }
  if (latestDraft) {
    rows.push({
      // One draft goes straight into the editor; several need choosing between.
      href:
        counts.drafts === 1 ? `/admin/posts/${latestDraft.id}` : "/admin/posts",
      text: countOf(counts.drafts, ["journal draft", "journal drafts"]),
      note: `Latest: “${latestDraft.title || "Untitled"}”`,
      action: counts.drafts === 1 ? "Continue" : "Open",
      urgent: false,
      icon: "journal",
    });
  }

  const attention = attentionCount(counts) + (unfinished ? 1 : 0);
  const live = batch.items.filter((item) => item.state === "live");

  return (
    <AdminPage
      title="Overview"
      actions={
        <>
          <p className="w-full text-sm text-ash md:order-last md:w-auto md:basis-full">
            {attention
              ? `${countOf(attention, ["thing wants", "things want"])} a look.`
              : "Nothing needs a look."}
          </p>
          <div className="flex flex-wrap gap-2 md:ml-auto">
            {/* Phones already have the floating Add button. */}
            <Link
              href={ADD_MEDIA_HREF}
              className={`${GHOST_BUTTON} max-md:hidden`}
            >
              Add media
            </Link>
            <NewPostButton label="New journal post" className={GHOST_BUTTON} />
            <Link href="/admin/videos#new-roll" className={GHOST_BUTTON}>
              New roll
            </Link>
          </div>
        </>
      }
    >
      {/* One grid, not a row and then a section below it: the right column is
          usually taller than a short attention list, and a section underneath
          the whole row would start after it and leave a hole on the left. It
          spans both rows instead, and the second row takes any spare height, so
          Recently added sits straight under Needs attention. A phone stacks them
          in source order: attention, newsletter, numbers, recent. */}
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr] lg:grid-rows-[auto_1fr]">
        <section className="overflow-hidden rounded-xl border border-hairline bg-film">
          <h2
            className={`border-b border-hairline px-4 py-3.5 md:px-5 ${LABEL}`}
          >
            Needs attention
          </h2>
          {rows.length ? (
            <ul className="divide-y divide-white/8">
              {rows.map((row) => (
                <li key={row.href + row.text}>
                  <AttentionRow row={row} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-sm text-ash md:px-5">
              Every still is dated and tagged, and every clip is on a roll.
            </p>
          )}
        </section>

        <div className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <section className="flex flex-col gap-3 rounded-xl border border-gold/30 bg-film p-4 md:p-5">
            <h2 className={`${LABEL} text-gold`}>Next newsletter</h2>
            {batch.newest ? (
              <>
                <span className="text-lg">{batchSummary(live)}</span>
                <span className="text-sm text-ash">
                  Goes out once nothing new is added for a while — around{" "}
                  <LocalTime
                    value={estimatedSendTime(batch.newest).toISOString()}
                  />
                  .
                </span>
              </>
            ) : (
              <span className="text-sm text-ash">
                Nothing new since the last email. Publishing adds to it.
              </span>
            )}
            <Link
              href="/admin/newsletter"
              className={`${GHOST_BUTTON} self-start`}
            >
              {batch.newest
                ? "Preview and choose items"
                : "Subscribers and history"}
            </Link>
          </section>

          <section className="flex flex-col gap-3.5 rounded-xl border border-hairline bg-film p-4 md:p-5">
            <h2 className={LABEL}>Last 7 days</h2>
            <dl className="grid grid-cols-2 gap-3">
              <Stat value={week.views} label="views" />
              <Stat value={week.visitors} label="visitors" />
              <Stat value={week.likes} label="likes" />
              <Stat value={week.subscribers} label="new subscribers" />
            </dl>
            <DailyVisitors daily={week.daily} />
            {week.mostLiked ? (
              <span className="text-xs text-ash">
                Most liked:{" "}
                <span className="text-bone">
                  {week.mostLiked.title || "Untitled"}
                </span>
              </span>
            ) : null}
            {week.mostViewed.length ? (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs text-ash">Most viewed</h3>
                <ol className="-mx-2 flex flex-col">
                  {week.mostViewed.map((item) => (
                    <li key={item.kind + item.id}>
                      <Link
                        href={`/admin/${item.kind === "motion" ? "videos" : "posts"}/${item.id}`}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition hover:bg-white/3"
                      >
                        <span className="text-ash" aria-hidden="true">
                          <Icon
                            name={item.kind === "motion" ? "motion" : "journal"}
                            size={14}
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {item.title || "Untitled"}
                        </span>
                        <span className="text-xs text-ash tabular-nums">
                          {countOf(item.views, ["view", "views"])}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </section>
        </div>

        {recent.length ? (
          // min-w-0, or the scrolling strip's width would widen its grid column.
          <section className="flex min-w-0 flex-col gap-3 lg:col-start-1">
            <div className="flex items-baseline gap-3">
              <h2 className={LABEL}>Recently added</h2>
              <Link
                href="/admin/photos?order=added"
                className="text-xs text-gold hover:text-bone"
              >
                All stills →
              </Link>
            </div>
            <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
              {recent.map((photo) => {
                const width = Math.round(
                  (photo.width / photo.height) * RECENT_HEIGHT,
                );
                return (
                  <li key={photo.id} className="shrink-0">
                    <Link
                      href={`/admin/photos?order=added&${OPEN_PHOTO_PARAM}=${encodeURIComponent(photo.id)}`}
                      aria-label="Open in Stills"
                      className="relative block overflow-hidden rounded-sm outline-offset-2 hover:outline hover:outline-gold"
                      style={{
                        width,
                        height: RECENT_HEIGHT,
                        backgroundColor: placeholderColor(photo),
                      }}
                    >
                      <Image
                        src={photo.imageUrl}
                        alt=""
                        fill
                        sizes={`${width}px`}
                        className="object-cover"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </AdminPage>
  );
}

function AttentionRow({ row }: { row: Attention }) {
  return (
    <Link
      href={row.href}
      className="group flex min-h-14 items-center gap-3.5 px-4 py-3 transition hover:bg-white/3 md:px-5"
    >
      {row.swatches?.length ? (
        <span className="hidden shrink-0 gap-0.5 md:flex" aria-hidden="true">
          {row.swatches.map((swatch) => (
            <span
              key={swatch.id}
              className="size-7 rounded-xs"
              style={{ backgroundColor: placeholderColor(swatch) }}
            />
          ))}
        </span>
      ) : (
        <span
          className="hidden h-7 w-10 shrink-0 items-center justify-center rounded-xs border border-white/20 text-ash md:flex"
          aria-hidden="true"
        >
          <Icon name={row.icon ?? "stills"} size={16} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          {/* A phone has no room for swatches, so a dot carries the urgency instead. */}
          <span
            className={`size-2 shrink-0 rounded-full md:hidden ${row.urgent ? "bg-gold" : "bg-ash"}`}
            aria-hidden="true"
          />
          {row.text}
        </span>
        <span className="text-xs text-ash">{row.note}</span>
      </span>
      <span
        className={`hidden shrink-0 rounded-md border px-3 py-1.5 text-sm transition md:inline ${
          row.urgent
            ? "border-gold text-gold group-hover:bg-gold/10"
            : "border-white/15 group-hover:border-gold"
        }`}
      >
        {row.action}
      </span>
      <span className="text-ash md:hidden" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="text-xs text-ash">{label}</dt>
      <dd className="text-2xl tabular-nums">{value.toLocaleString("en")}</dd>
    </div>
  );
}

const DAY_LABEL = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
  // Views are stored by UTC day, so the days are labelled in UTC too.
  timeZone: "UTC",
});

/**
 * Distinct visitors per day as seven bars, today last. A returning visitor counts
 * again on each day they come, which is also why the stat above is a sum of these
 * rather than a count of people — the view hash cannot match one day to the next.
 */
function DailyVisitors({ daily }: { daily: number[] }) {
  const peak = Math.max(...daily, 1);
  const start = weekStartDay(new Date());
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex h-12 items-end gap-0.5">
        {daily.map((count, i) => {
          const day = new Date(start);
          day.setUTCDate(day.getUTCDate() + i);
          const date = DAY_LABEL.format(day);
          const visitors = countOf(count, ["visitor", "visitors"]);
          // The end bars' tips hang inward, or they would poke out of the card.
          const align =
            i === 0
              ? "left-0"
              : i === daily.length - 1
                ? "right-0"
                : "left-1/2 -translate-x-1/2";
          return (
            <li key={i} className="group flex h-full flex-1 items-end">
              <span className="sr-only">{`${date}: ${visitors}`}</span>
              {/* A day nobody came keeps a hairline, so the week still reads as seven days. */}
              <span
                aria-hidden="true"
                className={`relative w-full rounded-t-[4px] transition ${count ? "bg-gold/70 group-hover:bg-gold" : "bg-white/10"}`}
                style={{
                  height: count ? `${Math.max((count / peak) * 100, 6)}%` : 2,
                }}
              >
                {/* Hung off the bar's top, so it points at the value it names. */}
                <span
                  className={`pointer-events-none absolute bottom-full z-10 mb-1.5 flex flex-col gap-0.5 rounded-md border border-hairline bg-frame px-2.5 py-1.5 whitespace-nowrap opacity-0 shadow-lg shadow-black/40 transition-opacity group-hover:opacity-100 motion-reduce:transition-none ${align}`}
                >
                  <span className="font-mono text-[10px] tracking-[0.15em] text-ash uppercase">
                    {date}
                  </span>
                  <span className="text-sm text-bone tabular-nums">
                    {visitors}
                  </span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <span
        className="flex justify-between text-[11px] text-ash"
        aria-hidden="true"
      >
        <span>Visitors per day</span>
        <span>today</span>
      </span>
    </div>
  );
}

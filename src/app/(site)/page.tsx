import Link from 'next/link';
import { ClipSample } from '@/components/home/ClipSample';
import { PhotoStrip } from '@/components/home/PhotoStrip';
import { PostList } from '@/components/journal/PostList';
import { SubscribeForm } from '@/components/newsletter/SubscribeForm';
import { AssetGate } from '@/components/site/AssetGate';
import { JsonLd } from '@/components/site/JsonLd';
import { db } from '@/lib/db';
import { loadSiteLinks } from '@/lib/links/load';
import { toSettings } from '@/lib/photo/settings';
import { personSchema, websiteSchema } from '@/lib/schema';
import { HOME_INTRO, SITE_NAME } from '@/lib/site';
import { CLIP_ORDER, loadRolls } from '@/lib/video/load-rolls';
import { groupIntoRolls } from '@/lib/video/roll';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // The bare name, not the root layout's "%s — name" template: this is the page a
  // search for the name should land on, and its title should be just that.
  title: { absolute: SITE_NAME },
  alternates: { canonical: '/' },
};

const LATEST_POSTS = 3;
const SAMPLE_CLIPS = 3;
/**
 * What the strip deals from: the newest this many, which today is the whole
 * library. PhotoStrip shuffles them and keeps only its first complete rows. A
 * cap rather than every photo, because the whole pool is shipped in the page so
 * that the deal can happen in the browser, and a front door's payload should not
 * grow with the archive.
 */
const STRIP_POOL = 120;

/**
 * The front door: a little of everything, in the nav's own order so the page
 * reads as a preview of the tabs above it. The posts are the newest; the stills
 * and clips are dealt at random on every load (useVisitSeed), so a return visit
 * shows a different corner of the work. Statically rendered like the pages it
 * summarises, and revalidated by the same post, photo and video actions that
 * rebuild them — the shuffle runs in the browser rather than making this page
 * dynamic.
 *
 * Every section links on to the full surface it was cut from, and none of them
 * re-implements its surface: the posts are the journal's own list, the frames the
 * wall's own polaroids, the clips the roll's own rows.
 */
export default async function HomePage() {
  const [links, posts, postCount, photos, rolls, videos] = await Promise.all([
    loadSiteLinks(),
    db.blogPost.findMany({
      where: { draft: false },
      orderBy: { publishedAt: 'desc' },
      take: LATEST_POSTS,
      select: { id: true, slug: true, title: true, content: true, markdownContent: true, publishedAt: true },
    }),
    db.blogPost.count({ where: { draft: false } }),
    db.photo.findMany({
      orderBy: { createdAt: 'desc' },
      take: STRIP_POOL,
      select: {
        id: true,
        imageUrl: true,
        width: true,
        height: true,
        title: true,
        location: true,
        camera: true,
        settings: true,
        avgHue: true,
        avgChroma: true,
        avgLightness: true,
        warmth: true,
        isMonochrome: true,
        takenAt: true,
      },
    }),
    loadRolls(),
    // Every clip: a clip's frame code is its place on its roll, so the rolls have
    // to be laid out in full before any can be quoted — and every one is in the
    // deal anyway.
    db.video.findMany({
      orderBy: [...CLIP_ORDER],
      select: {
        id: true,
        rollId: true,
        spriteUrl: true,
        posterImageUrl: true,
        spriteFrames: true,
        width: true,
        height: true,
        durationSeconds: true,
        title: true,
        description: true,
        createdAt: true,
      },
    }),
  ]);

  // Newest first, which is only what the prerendered HTML shows until the deal —
  // see ClipSample.
  const clips = groupIntoRolls(rolls, videos)
    .flatMap((roll) => roll.clips.map((clip, index) => ({ clip, index, letter: roll.letter })))
    .sort((a, b) => b.clip.createdAt.getTime() - a.clip.createdAt.getTime());

  const strip = photos.map((photo) => ({ ...photo, settings: toSettings(photo.settings) }));

  return (
    <main className="flex flex-col gap-14 max-strip:gap-10">
      <JsonLd schema={websiteSchema()} />
      <JsonLd schema={personSchema(links)} />

      <section aria-label="Introduction" className="pt-2">
        <p className="font-journal max-w-[34ch] text-2xl leading-snug text-bone text-balance sm:text-[1.75rem]">
          {HOME_INTRO}
        </p>
      </section>

      {/* One gate for both media sections, so the strip and the clips cascade in
          together once their images are in, the way the wall does — the intro
          and the journal are text and never wait. */}
      <AssetGate className="flex flex-col gap-14 max-strip:gap-10">
        {strip.length > 0 ? (
          <section aria-labelledby="home-stills">
            <SectionHeading id="home-stills" title="Stills" href="/stills" more="The whole wall" />
            <PhotoStrip photos={strip} />
          </section>
        ) : null}

        {clips.length > 0 ? (
          <section aria-labelledby="home-motion">
            <SectionHeading
              id="home-motion"
              title="Motion"
              count={`${videos.length} ${videos.length === 1 ? 'clip' : 'clips'}`}
              href="/motion"
              more="Every roll"
            />
            <ClipSample clips={clips} count={SAMPLE_CLIPS} />
          </section>
        ) : null}
      </AssetGate>

      {posts.length > 0 ? (
        <section aria-labelledby="home-journal">
          <SectionHeading
            id="home-journal"
            title="Journal"
            count={`${postCount} ${postCount === 1 ? 'post' : 'posts'}`}
            href="/journal"
            more="All posts"
          />
          <div className="journal-sheet">
            <PostList posts={posts} headingLevel="h3" />
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="home-newsletter"
        className="rounded-[3px] border border-hairline bg-film px-6 py-8 sm:px-10"
      >
        <h2 id="home-newsletter" className="text-xl font-semibold tracking-tight uppercase">
          Get new things by email
        </h2>
        <p className="mt-1 mb-5 max-w-[60ch] text-sm text-ash">
          One email when something new goes up — pick which kinds below. Nothing else,
          and one click to leave.
        </p>
        <div className="max-w-xl">
          <SubscribeForm inline />
        </div>
      </section>
    </main>
  );
}

/** The motion page's heading row, with a way on to the full surface at its end. */
function SectionHeading({
  id,
  title,
  count,
  href,
  more,
}: {
  id: string;
  title: string;
  count?: string;
  href: string;
  more: string;
}) {
  return (
    <div className="mb-5 flex items-baseline gap-4">
      <h2 id={id} className="text-xl font-semibold tracking-tight uppercase">
        {title}
      </h2>
      {count ? <span className="font-mono text-xs text-ash">{count}</span> : null}
      <Link
        href={href}
        className="ml-auto font-mono text-xs tracking-[0.15em] text-ash uppercase transition hover:text-gold"
      >
        {more} →
      </Link>
    </div>
  );
}

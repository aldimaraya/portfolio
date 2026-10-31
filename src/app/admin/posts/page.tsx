import Image from 'next/image';
import Link from 'next/link';
import { AdminPage } from '@/components/admin/shell/AdminPage';
import { db } from '@/lib/db';
import { NewPostButton } from '@/components/admin/NewPostButton';
import { GOLD_BUTTON } from '@/components/admin/fields';
import { formatPostDate } from '@/lib/post/date';
import { parseContent } from '@/lib/post/content';
import { firstImage, referencedMedia, type PostMedia, type ResolvedImage } from '@/lib/post/media';
import { markdownToContent } from '@/lib/markdown/legacy';
import { parsePostFilter, summarizeDraft, type PostFilter } from '@/lib/admin/journal';
import { countOf } from '@/lib/admin/overview';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const FILTER_LABELS: Record<PostFilter, string> = { all: 'All', drafts: 'Drafts', published: 'Published' };

export default async function AdminPostsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filter = parsePostFilter(first((await searchParams).show));

  const [rows, trayPhotos] = await Promise.all([
    // Drafts first, then newest published — the drafts are the ones needing work.
    db.blogPost.findMany({
      orderBy: [{ draft: 'desc' }, { publishedAt: 'desc' }],
      select: { id: true, title: true, slug: true, draft: true, publishedAt: true, content: true, markdownContent: true },
    }),
    // Every post's trip photos at once: one query beats one per card, and a
    // library is a few hundred rows of five columns.
    db.journalPhoto.findMany({
      orderBy: [{ takenAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      select: { id: true, postId: true, imageUrl: true, width: true, height: true },
    }),
  ]);

  // A post never saved as blocks is converted here without the database
  // lookups loadPostBody does: its images stay `external`, which firstImage
  // skips, so a legacy post simply shows no thumbnail.
  const posts = rows.map((post) => ({
    ...post,
    content: parseContent(post.content) ?? markdownToContent(post.markdownContent),
  }));
  const published = posts.filter((post) => !post.draft);

  const stillIds = [...new Set(posts.flatMap((post) => referencedMedia(post.content.blocks).stills))];
  const [stills, views] = await Promise.all([
    stillIds.length
      ? db.photo.findMany({
          where: { id: { in: stillIds }, draft: false },
          select: { id: true, imageUrl: true, width: true, height: true },
        })
      : [],
    published.length
      ? db.view.groupBy({
          by: ['refId'],
          where: { kind: 'journal', refId: { in: published.map((post) => post.id) } },
          _count: { _all: true },
        })
      : [],
  ]);

  const stillMap = Object.fromEntries(
    stills.map((photo) => [photo.id, { url: photo.imageUrl, width: photo.width, height: photo.height, alt: '' }]),
  );
  const viewCounts = new Map(views.map((row) => [row.refId, row._count._all]));
  const trayOf = (postId: string) => trayPhotos.filter((photo) => photo.postId === postId);

  /**
   * The post's first picture as a reader would see it, else — for a draft
   * still being laid out — the first trip photo in the tray. Journal photos are
   * matched to their own post, as loadPostMedia does.
   */
  function thumbnailOf(post: (typeof posts)[number]): ResolvedImage | null {
    const tray = trayOf(post.id);
    const media: PostMedia = {
      journal: Object.fromEntries(
        tray.map((photo) => [photo.id, { url: photo.imageUrl, width: photo.width, height: photo.height, alt: '' }]),
      ),
      stills: stillMap,
      clips: {},
    };
    const placed = firstImage(post.content.blocks, media);
    if (placed || !post.draft || !tray.length) return placed;
    return { url: tray[0].imageUrl, width: tray[0].width, height: tray[0].height, alt: '' };
  }

  const drafts = posts.filter((post) => post.draft);
  const counts: Record<PostFilter, number> = { all: posts.length, drafts: drafts.length, published: published.length };
  const showDrafts = filter !== 'published';
  const showPublished = filter !== 'drafts';

  return (
    <AdminPage
      title="Journal"
      count={countOf(posts.length, ['post', 'posts'])}
      actions={
        <>
          <nav aria-label="Show" className="flex gap-1 rounded-lg border border-hairline bg-film p-[3px]">
            {(Object.keys(FILTER_LABELS) as PostFilter[]).map((option) => (
              // Links rather than state, so a filtered list survives a reload
              // and the back button, like the public filters.
              <Link
                key={option}
                href={option === 'all' ? '/admin/posts' : `/admin/posts?show=${option}`}
                aria-current={filter === option ? 'page' : undefined}
                className={`flex h-7 items-center rounded-md px-2.5 text-xs transition-colors ${
                  filter === option ? 'bg-frame text-bone' : 'text-ash hover:text-bone'
                }`}
              >
                {FILTER_LABELS[option]}
                {option === 'all' ? null : <span className="ml-1.5">{counts[option]}</span>}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <NewPostButton className={GOLD_BUTTON} />
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-7">
        {showDrafts && drafts.length ? (
          <section className="flex flex-col gap-2.5">
            <h2 className="font-mono text-[11px] tracking-[0.15em] text-ash uppercase">In progress</h2>
            {drafts.map((post) => {
              const summary = summarizeDraft(
                post,
                trayOf(post.id).map((photo) => photo.id),
              );
              const thumbnail = thumbnailOf(post);
              const warned = summary.warnings.length > 0;
              return (
                <Link
                  key={post.id}
                  href={`/admin/posts/${post.id}`}
                  className={`group flex items-center gap-4 rounded-[10px] border bg-film p-3 transition hover:border-gold sm:gap-[18px] sm:p-3.5 ${
                    warned ? 'border-gold/30' : 'border-hairline'
                  }`}
                >
                  <Thumbnail image={thumbnail} className="h-[72px] w-28 sm:h-[100px] sm:w-40" sizes="160px" empty="No photos yet" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className={`font-journal text-lg sm:text-[22px] ${post.title.trim() ? '' : 'text-[#b4b4ba]'}`}>
                      {post.title.trim() || 'Untitled'}
                    </span>
                    <span className="text-[13px] text-ash">
                      {summary.meta} · started {formatPostDate(post.publishedAt)}
                    </span>
                    {warned ? (
                      <span className="flex flex-wrap gap-1.5">
                        {summary.warnings.map((warning) => (
                          <span
                            key={warning}
                            className="flex h-[22px] items-center rounded bg-amber-400/10 px-2 text-[11px] text-amber-400"
                          >
                            {warning}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {/* The whole card is the link; this is only its label, and a
                      phone has no room for it beside the thumbnail. */}
                  <span
                    aria-hidden
                    className={`hidden h-9 shrink-0 items-center rounded-md border px-3.5 text-sm sm:flex ${
                      warned ? 'border-gold text-gold' : 'border-white/15 text-bone'
                    }`}
                  >
                    {post.content.blocks.length ? 'Continue' : 'Open'}
                  </span>
                </Link>
              );
            })}
          </section>
        ) : null}

        {showPublished && published.length ? (
          <section className="flex flex-col">
            <h2 className="mb-2.5 font-mono text-[11px] tracking-[0.15em] text-ash uppercase">Published</h2>
            <ul className="flex flex-col">
              {published.map((post) => {
                const viewCount = viewCounts.get(post.id) ?? 0;
                return (
                  <li key={post.id} className="border-t border-white/[0.08]">
                    <Link
                      href={`/admin/posts/${post.id}`}
                      className="flex min-h-16 items-center gap-4 py-2 transition hover:bg-frame/40"
                    >
                      <Thumbnail image={thumbnailOf(post)} className="h-12 w-[76px]" sizes="76px" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-journal text-[17px]">{post.title || 'Untitled'}</span>
                        <span className="truncate font-mono text-[11px] text-ash">/journal/{post.slug}</span>
                        {/* The date and views fold under the slug on a phone. */}
                        <span className="text-xs text-ash sm:hidden">
                          {formatPostDate(post.publishedAt)} · {countOf(viewCount, ['view', 'views'])}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-ash sm:block">{formatPostDate(post.publishedAt)}</span>
                      <span className="hidden w-20 shrink-0 text-right text-xs text-ash sm:block">
                        {countOf(viewCount, ['view', 'views'])}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {counts[filter] === 0 ? (
          <p className="text-sm text-ash">
            {filter === 'drafts' ? 'Nothing in progress.' : filter === 'published' ? 'Nothing published yet.' : 'No posts yet.'}
          </p>
        ) : null}
      </div>
    </AdminPage>
  );
}

function Thumbnail({
  image,
  className,
  sizes,
  empty,
}: {
  image: ResolvedImage | null;
  className: string;
  sizes: string;
  empty?: string;
}) {
  if (!image) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded border border-dashed border-white/20 text-center text-xs text-ash ${className}`}
      >
        {empty}
      </span>
    );
  }
  return (
    <span className={`relative shrink-0 overflow-hidden rounded bg-frame ${className}`}>
      <Image src={image.url} alt="" fill sizes={sizes} className="object-cover" />
    </span>
  );
}

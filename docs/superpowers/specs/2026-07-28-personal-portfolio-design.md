# Personal portfolio — design spec

Date: 2026-07-28

> ## ⚠ Historical document
>
> This is the brief the site was built from, kept for the reasoning behind its
> goals and constraints. It does not describe the site as it stands — most
> notably, Motion is no longer "a scrolling film-reel viewer": it is a list of
> clips, each with a page of its own.
>
> **For what the site actually does, read [`docs/architecture.md`](../../architecture.md).**

## Overview

A personal website to showcase photography and film work, plus a lightweight
blog, with a custom admin area for managing all content without touching
code. Three public sections: a color-sorted photo wall ("Stills"), a
scrolling film-reel video viewer ("Motion"), and a Markdown blog
("Journal").

A rough visual mockup (dark "cinematic gold" theme, polaroid wall, film-strip
scroll effect) was provided and is preserved at
`docs/superpowers/specs/assets/2026-07-28-mockup-reference.html` for
reference. The name "Alex Morgan" in that file is a placeholder only.

## Goals

- Fast, responsive public site for browsing photos, videos, and blog posts.
- Photos and videos are self-hosted (no YouTube embeds/branding).
- A password-protected admin area to add/edit/delete content without
  editing code.
- Photos auto-arrange into a color gradient; no manual photo reordering
  needed.
- Visitors can filter photos/videos by camera, location, and free-form
  tags.

## Non-goals (v1)

- Multi-user accounts or roles (single admin only).
- Server-side video transcoding or adaptive-bitrate streaming. Videos are
  compressed to a web-delivery encode manually before upload (see Media
  pipeline).
- A rich-text/WYSIWYG blog editor (Markdown is sufficient given low post
  volume).
- A visitor-facing layout/palette switcher (one final layout and palette
  are chosen; see below).
- Search (filtering by camera/location/tag covers the near-term need).

## Architecture & stack

- **Framework:** Next.js (App Router) + TypeScript.
- **Hosting:** Vercel (Hobby/free tier). Non-commercial personal site, so
  this fits Vercel's free-tier terms. Verify current limits at
  vercel.com/pricing before deploying, since they change over time.
- **Database:** Postgres (Neon serverless free tier, pairs natively with
  Vercel) via Prisma ORM.
- **Media storage:** Cloudflare R2 (S3-compatible object storage, zero
  egress fees) behind Cloudflare's CDN. Photos and videos stream directly
  from R2/CDN, not from the Next.js server, and don't count against
  Vercel's bandwidth cap.
- **Auth:** single admin account (credentials in environment config,
  password hashed with bcrypt). Login sets a signed, HTTP-only session
  cookie; Next.js middleware protects all `/admin` routes and redirects
  unauthenticated visitors to a login page. No third-party auth provider.
- **Styling:** Tailwind CSS, translating the mockup's existing CSS
  variables/breakpoints into Tailwind config so the justified-rows layout
  and responsive behavior carry over faithfully.

## Data model

> **Superseded in places.** See "Status and deviations" in
> `docs/superpowers/plans/2026-07-28-personal-portfolio.md` for the shipped shape.
> In short: `Photo.filmStock` became `Photo.settings` (JSON: lens, focalLength,
> aperture, shutter, iso); `Video` lost `camera`/`format`/`fps`/`iso`, and
> `rollGroup` became a free-text `description`, so the motion page is one flat
> drag-ordered wall rather than grouped rolls.

```
Photo
  id
  imageUrl        // R2 key/URL
  location
  camera
  filmStock       // superseded by `settings` (JSON)
  orientation     // portrait | landscape (derived from image dimensions)
  avgHue          // 0-360, computed at upload
  avgLightness     // 0-1, computed at upload
  isMonochrome    // derived: true if avg saturation below threshold
  createdAt

Video
  id
  videoUrl        // R2 key/URL
  posterImageUrl
  spriteUrl       // R2 key/URL of the 10-frame preview sprite sheet
  title
  camera          // dropped — capture settings mean little for clips
  format          // dropped
  fps             // dropped
  iso             // dropped
  rollGroup       // superseded by free-text `description`; no roll grouping
  sortOrder       // manual order, set by dragging rows in the admin list
  createdAt

BlogPost
  id
  slug
  title
  markdownContent
  publishedAt
  draft           // boolean

Tag
  id
  name

PhotoTag  (join table: Photo <-> Tag, many-to-many)
VideoTag  (join table: Video <-> Tag, many-to-many)
```

Notes:
- `avgHue`, `avgLightness`, and `isMonochrome` are computed once at upload
  time (not recomputed per page load) by downsampling the image and
  averaging pixel color.
- Photos have no manual `sortOrder` — display order is fully automatic
  (see Color-sort algorithm below). Videos keep manual `sortOrder` since
  color-sorting doesn't apply to them.
- `location` filtering applies to photos only. The mockup's video frames
  don't carry a location field, and none was requested for video, so
  videos are filterable by `camera` and `tags` only.

## Public site structure

**Navigation:** three top-level tabs — `STILLS | MOTION | JOURNAL` — in
the existing header (name + tagline, gold underline on the active tab).

**Stills page:**
- Justified-rows layout, cinematic gold palette, each polaroid captioned
  with location and camera/film-stock metadata (per the mockup).
- Default order: a top-to-bottom color gradient. Photos are sorted by
  `avgHue` and packed sequentially into justified rows (in the same
  greedy row-fill order as before), so hue progresses smoothly as you
  scroll, while each row still fills using real photo aspect ratios.
  Black & white / low-saturation photos (`isMonochrome`) are pulled into
  their own band, sorted dark-to-light by `avgLightness`, placed before
  the color spectrum begins.
- A filter bar (chips/dropdowns for camera, location, tags) sits above
  the wall. Selecting filters narrows the wall to the matching subset,
  keeping the same default color-sort ordering. Filters are reflected in
  the URL query string so filtered views are shareable/bookmarkable.
  Combining filters uses OR logic within a single filter type (e.g.
  selecting two locations shows photos matching either) and AND logic
  across different filter types (e.g. a selected camera plus a selected
  tag shows photos matching both).

**Motion page:**
- The unwinding film-strip scroll effect with the roll-index sidebar,
  preserved from the mockup.
- Each frame's video is played via a custom `<video>` wrapper component
  (see Media pipeline) instead of a YouTube `<iframe>` — same visual
  frame and chrome, no third-party branding.
- The frame currently centered in the strip shows an animated preview
  that cycles through stills of the video, so it reads as playing without
  loading any video (see Animated frame previews).
- Same filter bar pattern as Stills (camera, tags), narrowing which
  videos/frames appear while preserving roll order.

**Journal page:**
- A list of posts (title, date, excerpt) linking to individual post
  pages.
- Post pages render Markdown content in a reading-friendly layout, styled
  consistently with the site's dark/gold theme (not a separate visual
  language).

**Responsive behavior:** carries over the mockup's existing breakpoints —
layout/nav collapse on tablet/mobile, film strip stacks vertically on
small screens.

## Color-sort algorithm (Stills page)

1. At upload, compute each photo's average color (downsample the image,
   average pixel RGB), convert to HSL, and store `avgHue`,
   `avgLightness`, and `isMonochrome` (true when average saturation falls
   below a small threshold).
2. To render the wall: split photos into two groups — monochrome and
   color. Sort the monochrome group by `avgLightness` ascending (dark to
   light). Sort the color group by `avgHue` ascending. Concatenate:
   monochrome group first, then color group.
3. Feed that ordered list into the same justified-rows packing algorithm
   from the mockup (greedy row-fill using each photo's aspect ratio).
   Because packing consumes photos in order without reshuffling for
   color, the hue progression reads top-to-bottom as the rows fill.
4. When a filter is active, apply the filter before step 2 so the same
   sorting logic runs on the filtered subset.

## Admin area

Protected by the single-admin password login described above.

- **Dashboard:** lists all photos, videos, and posts.
- **Photo form:** upload a file (direct-to-R2, see Media pipeline), fill
  in location, camera, film stock/lens; tags via a multi-select/free-text
  field (typing a new tag creates it). No manual ordering — order is
  automatic.
- **Video form:** upload a file, poster image, title, camera/format/fps/
  ISO, which roll it belongs to, manual sort order within that roll,
  tags. Uploads are expected to be the compressed web encode, not a 4K
  master (see Media pipeline); the form shows the expected size range and
  warns on unusually large files rather than silently accepting them.
- **Blog form:** a Markdown textarea with a live preview pane
  side-by-side. No WYSIWYG library.
- **Delete** actions for all content types.
- No separate "manage tags" screen — tags are created inline as needed,
  which is fine at this content scale.

## Media pipeline

- **Upload flow:** the browser uploads the file directly to R2 via
  pre-signed URLs (large video files never pass through the Next.js
  server); the resulting R2 key/URL is saved to the database. Uploads use
  **multipart** rather than a single PUT — a 1 GB upload that fails at
  90% would otherwise restart from zero, and multipart also allows retry
  of individual failed parts.
- **Photos:** served through Next.js's `<Image>` component pointed at the
  R2/CDN URL, getting automatic resizing and lazy-loading.
- **Videos:** a custom lightweight `<video>` wrapper — native HTML5
  video with custom-styled controls matching the theme, a poster frame,
  and the film-frame visual chrome from the mockup.
- **Video encoding is a manual pre-upload step, not a pipeline stage.**
  Source footage is 4K and can run ~1 GB per clip, which is far too heavy
  to serve directly to visitors (slow first frame, no quality adaptation,
  punishing on mobile data). Before uploading, each video is encoded
  locally to a web-delivery version — 1080p H.264, roughly 5–8 Mbps,
  which brings a ~1 GB master down to roughly 100–200 MB with quality
  that reads well at portfolio frame size. 4K masters stay offline; only
  the web encode is uploaded. No server-side transcoding or
  adaptive-bitrate pipeline in v1.
- **Poster-first loading on the Motion page:** because the film strip
  stacks several videos on one page, each frame renders only its poster
  image (or animated preview, below) until the visitor actually plays it.
  Video sources are attached on play, never eagerly for every frame. This
  is essential to the "fast and responsive" goal — several
  simultaneously-loading video elements would otherwise stall the page.

## Animated frame previews (Motion page)

Film frames appear to be playing without any video element loading. Each
video gets a **sprite sheet** — 10 evenly-spaced frames extracted from
the video, tiled into one wide image — animated by stepping a
`transform: translateX()` across the strip with a CSS `steps(10)`
animation over 2 seconds, looping. One image request (~40 KB), a
compositor-driven transform, and no main-thread work per tick. This is
the same technique used for hover previews on major streaming sites.

- **Sprite generation happens client-side at upload.** The browser
  already holds the video file for upload, so it seeks to 10 evenly
  spaced timestamps, draws each to a `<canvas>`, composites them into one
  strip, and uploads the result to R2 alongside the video. This keeps the
  "no server-side transcoding" constraint intact — no ffmpeg on the
  server. The first sprite frame doubles as the poster image if none is
  supplied separately.
- **Only the active frame animates.** The frame currently centered in the
  film strip runs its animation; all others hold on a static first frame.
  This matches the film-projector metaphor of the mockup and keeps cost
  near zero regardless of how many frames are in the roll. Implemented by
  toggling `animation-play-state` as the scroll position changes.
- **Reduced motion is respected.** Under `prefers-reduced-motion: reduce`
  the animation never starts and every frame shows a static poster. A
  page of looping previews is precisely what that setting exists to
  suppress, so this is not optional.
- **Click loads the real video**, swapping the sprite for the `<video>`
  element on demand.

### Storage cost reference

R2 storage is $0.015/GB-month with the first 10 GB free, and egress is
free on all storage classes (so visitor traffic adds no bandwidth cost).
At the compressed sizes above this is negligible — even 100 videos at
200 MB each is ~20 GB, or roughly $0.15/month. Figures current as of
2026-07-28; re-check Cloudflare's pricing page before relying on them.

## Error handling

- Admin forms are validated server-side (e.g. with Zod) — reject missing
  required fields or unsupported file types before touching R2 or the
  database.
- Public pages fall back to a placeholder if an image/video URL fails to
  load, rather than breaking the layout.
- Unauthenticated visits to `/admin` redirect to a login page; sessions
  expire after a reasonable period.

## Testing

Kept proportional to a personal-scale project:
- Unit tests for the color-sort/justified-row packing logic, the
  film-strip scroll math, and sprite frame-timestamp calculation (the
  trickiest pure logic in the app).
- A couple of end-to-end smoke tests (e.g. Playwright) covering admin
  login and the create-photo flow, since that's the highest-value flow
  to protect from regressions.
- No large test suite beyond that.

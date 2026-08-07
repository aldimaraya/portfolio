# Architecture and features — as built

Updated 2026-08-04. This describes the site **as it exists now**, and is the
document to trust when the spec or the plan disagrees with it.

The other two documents are history, and are still worth reading for the
reasoning behind decisions rather than for what the code does today:

- [`specs/2026-07-28-personal-portfolio-design.md`](superpowers/specs/2026-07-28-personal-portfolio-design.md)
  — the original design brief.
- [`plans/2026-07-28-personal-portfolio.md`](superpowers/plans/2026-07-28-personal-portfolio.md)
  — the task-by-task implementation plan, with a running record of deviations.
- [`code-review-findings.md`](code-review-findings.md) — open defects, ranked by
  what they cost. Fixed items are struck through rather than deleted.

The site is feature-complete for a first release. What is left before it is
finished is listed under [Known gaps](#known-gaps) — none of it is scaffolding,
and there are no stubs left anywhere in the codebase.

---

## The shape of it

One Next.js App Router application, four surfaces:

| Surface | Route | What it is |
| --- | --- | --- |
| Stills | `/stills` | A photo wall whose order is derived entirely from colour |
| Motion | `/motion`, `/motion/[id]` | A roll of clips, each with its own page |
| Journal | `/journal`, `/journal/[slug]` | A Markdown blog |
| Admin | `/admin/**`, `/login` | One password-protected area managing all of it |

`/` redirects to `/stills`. The three public surfaces share chrome through the
`(site)` route group — a group rather than a wrapper component, so a new public
page cannot forget to include it. `/admin` and `/login` sit outside it with
their own chrome.

Every public route is **static or SSG**, verified in the build output. A visitor
is served from the CDN and never waits on Postgres. That is what makes the
`revalidatePath` calls in the admin actions load-bearing rather than decorative:
they are the only thing that updates a public page after an edit.

```
Browser ──────────────────────► R2 (presigned multipart)          upload
Browser ◄────────────────────── R2 / CDN                          video, sprites
Browser ◄── next/image ──────── R2 / CDN                          photos
Browser ◄── Vercel CDN ──────── prerendered HTML ◄── Prisma ── Neon
```

The app server sits outside the media path entirely, in both directions.

---

## Load-bearing constraints

These are the decisions the rest of the code is shaped around. Breaking one
does not cause a test failure — it causes the design to stop making sense.

### Derived data is computed once, in the browser, at upload time

Average colour ([`lib/color/analyze.ts`](../src/lib/color/analyze.ts)), border
insets ([`lib/photo/border.ts`](../src/lib/photo/border.ts)), compression
([`lib/photo/compress.ts`](../src/lib/photo/compress.ts)), video sprite sheets
([`lib/video/sprite.ts`](../src/lib/video/sprite.ts)) and clip duration all run
client-side and are stored on the row. **There is no server-side image or video
processing anywhere.** Rendering a public page is a plain database read.

The cost of this is that anything not captured at upload time is generally gone
for good, which is why three backfill scripts exist and why two columns have
awkward defaults. See [Backfills](#backfills).

### Media never passes through the app server

Uploads go browser → R2 over presigned **multipart** URLs
([`lib/storage/multipart.ts`](../src/lib/storage/multipart.ts),
[`app/api/upload/*`](../src/app/api/upload)), so a 1 GB upload failing at 90%
does not restart from zero. Video is served straight from R2/CDN; only photos
take the `next/image` hop.

The exceptions are the two admin-only same-origin reads that share
[`lib/storage/media-source.ts`](../src/lib/storage/media-source.ts):
[`photo-source`](../src/app/api/admin/photo-source/route.ts), which lets the
border trimmer get untainted canvas pixels, and
[`video-source`](../src/app/api/admin/video-source/route.ts), which pulls a
stored clip back so its scrub preview can be regenerated. Both are session-gated
and restricted to keys inside our own bucket. `video-source` is the one place a
whole clip passes through the app server; it is rare, manual, and the alternative
is CORS configuration on the bucket, which does not live in this repo.

### A photo's EXIF never reaches the stored copy

`prepareUpload` ([`lib/photo/trim-client.ts`](../src/lib/photo/trim-client.ts))
re-encodes any file carrying EXIF through a canvas before it reaches R2, so a
photo's GPS coordinates are never published. `keepsOriginal` defaults to "this
has metadata" so an uninformed caller gets the safe answer.

The consequence: `Photo.takenAt` is prefilled from `DateTimeOriginal` at upload
and **cannot be recovered afterwards from anything stored**. A photo uploaded
without it has to have its date typed in by hand.

### Wall order is derived from colour, in OKLab

Photos have no manual sort column.
[`lib/color/sort.ts`](../src/lib/color/sort.ts) produces a monochrome band
dark→light followed by a cool→warm sweep, and
[`lib/photo/justify.ts`](../src/lib/photo/justify.ts) packs that order into
justified rows.

It sorts on **`warmth`** — the average colour projected onto one cool↔warm axis
— and deliberately not on hue. Measured across this library, half to two-thirds
of a typical frame's colour cancels out (sky against land), so a dominant hue is
the winner of a very close election and orders the wall by noise. Warmth stays
meaningful when nothing dominates.

`isMonochrome` is measured differently on purpose, from per-pixel RMS chroma
*before* any cancellation, so a red car against a cyan sky is not filed as
black-and-white.

### The motion page's projector reports scrolling; it never drives it

The roll used to be the layout: a tall runway track, a sticky viewport, and a
`translateY` on the frames mapped from `window.scrollY`. That competed with the
browser's own scrolling — and on iOS with the URL bar resizing mid-gesture —
which is what made the page behave strangely on a phone.

What survives is decoration only.
[`MotionRoll`](../src/components/motion/MotionRoll.tsx) writes
`--perforation-offset` and `--spool-turn` from that same `scrollY`, geared to
each other, and **deleting its effect changes nothing about how the page
scrolls.** Keep it that way. `PERFORATION_PITCH` and `.film-rail`'s
`background-size` are two halves of one number and must move together.

### Reduced motion means off, not gentler

`prefers-reduced-motion: reduce` stops sprite previews dead rather than slowing
them, parks the projector, and skips autoplay on a clip page. Every one of those
is a deliberate choice repeated in `globals.css` and
[`ClipStage`](../src/components/motion/ClipStage.tsx).

### Video encoding is a manual pre-upload step

Clips are encoded locally to 1080p H.264 at ~5–8 Mbps before upload. 4K masters
stay offline. [`lib/video/audio.ts`](../src/lib/video/audio.ts) warns at upload
time about uncompressed PCM audio, which no browser can decode — the cause of a
long-running "clips play silently" bug.

---

## Features, surface by surface

### Stills

- **Colour-sorted wall.** Justified rows, order derived as described above.
- **Filters** — camera, location, and tags. **OR within a type, AND across
  types**, held in the URL query string
  ([`lib/filters/parse.ts`](../src/lib/filters/parse.ts) ↔
  [`apply.ts`](../src/lib/filters/apply.ts)) so a filtered view is shareable.
  Filtering happens in the browser: the page reads no `searchParams`, because a
  page that reads them is dynamic by definition, and the wall already needs
  every photo to pack its rows.
- **Lightbox** with swipe, keyboard navigation, and a FLIP expand from the
  clicked frame. The caption carries the date and capture settings.
- **Load-time placeholders** painted from the photo's own average colour, and a
  wall-level loading state gated on real image `load` events rather than a timer
  ([`useAssetsReady`](../src/components/site/useAssetsReady.ts)).

### Motion

- **The roll** (`/motion`) is a list: a 26px perforated film rail down the left,
  clips as rows, on ordinary page scroll. Each row shows a sprite-sheet
  thumbnail, title, description and running time. Sprite previews animate on
  hover or keyboard focus only — six looping previews down a list is ambient
  motion competing for attention.
- **A clip page** (`/motion/[id]`) per clip: the projector gate, the title, its
  position on the roll, its running time, and prev/next along the roll. SSG,
  like a journal post.
- **Clips run on arrival**, started from an effect rather than the `autoPlay`
  attribute — the attribute gives no way to learn that the browser refused,
  which is the case that has to be handled. Refused, the poster stays up with a
  play control. Not muted-to-force-it: these clips are graded and mixed.
- **The gate is sized against the window**, not a fixed pixel cap, so the frame,
  its title and its place on the roll are visible at once. `svh` rather than
  `vh`, because `vh` measures the viewport with mobile browser chrome retracted.
- **The projector**: a sticky spool at the head of the rail turning with the
  scroll, and a gate spool on a clip page that turns only while the clip runs.

### Journal

- Markdown posts with **drafts** — a draft 404s rather than being a private
  page, and is left out of `generateStaticParams` entirely.
- A **WYSIWYG-ish editor** in the admin: a toolbar over a Markdown textarea
  ([`lib/markdown/toolbar.ts`](../src/lib/markdown/toolbar.ts)) plus a media
  picker that inserts images from the existing library
  ([`lib/markdown/media.ts`](../src/lib/markdown/media.ts)), so a post can be
  formatted and illustrated without knowing Markdown.
- Slugs from titles, with collisions suffixed
  ([`lib/slug.ts`](../src/lib/slug.ts)).
- Excerpts flattened from the body for the list and for link previews.

### Admin

One password, one session. Photos, videos and posts each get a list and a form.

- **Photo upload** with client-side EXIF extraction, compression, an interactive
  border trimmer, tag input with suggestions, and colour analysis — all before
  anything reaches R2.
- **Video upload** generating a poster and an 18-frame sprite sheet locally,
  capturing dimensions and duration in the same metadata read. The frames come
  from a 1.5s window, not the whole clip — spread across a 28s clip they read as
  a slideshow rather than as motion. Where that window opens is guessed at a
  fifth of the way in and can then be dragged
  ([`lib/video/timestamps.ts`](../src/lib/video/timestamps.ts)); the source file
  stays in memory, so moving it costs a re-grab and not a re-download.
- **Regenerate preview frames** on a clip's edit page pulls the stored clip back
  through `video-source` and re-grabs, which is how a preview is changed after
  upload and how a legacy row's missing dimensions get filled in.
- **Drag-to-reorder** for videos, persisted as a whole ordering in one
  transaction rather than a moved pair, so the result cannot drift from what is
  on screen.
- **`AdminBar` and `AdminEditLink`** appear on public pages for a signed-in
  admin. They ask the client (`/api/auth/state`) rather than reading `cookies()`,
  because a cookie read would make the page dynamic and lose the CDN.

---

## Data model

[`prisma/schema.prisma`](../prisma/schema.prisma). Six models: `Photo`, `Video`,
`BlogPost`, `Tag`, and the two join tables.

Columns whose *shape* carries a decision:

| Column | Why it looks like that |
| --- | --- |
| `Photo.settings` (`Json`) | Lens/focal length/aperture/shutter/ISO as one blob, every field optional free text. Read it back through `toSettings()`, which coerces malformed JSON to blanks rather than throwing. |
| `Photo.warmth` | The wall's sort key. Defaults to 0, which files un-analysed rows as perfectly neutral until `recolor:photos` runs. |
| `Photo.takenAt` (nullable) | Null means unknown, and unknown is permanent — see the EXIF constraint above. |
| `Photo.hueStrength` | **Dead column.** Left declared only so `db push` stays additive; dropping it needs `--accept-data-loss`. Safe to drop by hand. |
| `Video.width/height` | Default 0, meaning "uploaded before these were stored". `FRAME_FALLBACK_RATIO` shapes those, and the clip page corrects itself from the file's own metadata. |
| `Video.durationSeconds` | `Float`, default 0 meaning unknown. Rounding on the way in would make the roll's running total drift. |
| `Video.sortOrder` | Videos *do* have a manual order, unlike photos. |
| `BlogPost.draft` | Defaults to `true`, so a half-written post cannot be published by forgetting a checkbox. |

---

## Auth

Single admin. bcrypt hash in the environment, `jose` JWT in an httpOnly cookie.

**Checked twice, on purpose.** [`src/proxy.ts`](../src/proxy.ts) gates
`/admin/*` pages, and every server action and route handler re-checks with
`isAuthenticated()` / `requireSession()`
([`lib/auth/guard.ts`](../src/lib/auth/guard.ts)) — because a server action is a
publicly reachable endpoint regardless of which page rendered the form.

The signing key is derived with HKDF-SHA256 from `SESSION_SECRET` (key material)
and `ADMIN_PASSWORD_HASH` (salt). Changing the password changes the bcrypt salt,
which changes the key, which invalidates every token issued under the old
password — so changing the password is a complete response to a leaked one, with
no second secret to remember to rotate.

**Failed logins are throttled** by
[`lib/auth/rate-limit.ts`](../src/lib/auth/rate-limit.ts): eight wrong passwords
from one address inside fifteen minutes locks it out for fifteen more, checked
before the body is parsed and long before bcrypt runs, so a locked-out caller
costs nothing to serve. The window re-arms on every failure, so a slow trickle
cannot sit under the limit indefinitely. The counter is an in-memory `Map`, not
KV — state is per serverless instance and lost on a cold start, which means a
sufficiently distributed attacker gets more than eight attempts in total. That is
the accepted trade: it costs nothing, adds no dependency, and stops the attack
that actually happens, which is one source firing a dictionary at one warm
instance. Swap the map for Upstash if that stops being true.

Tokens pin `HS256` explicitly and carry an issuer and audience. Redirects after
login go through `safeNextPath`
([`lib/auth/next-path.ts`](../src/lib/auth/next-path.ts)), which resolves against
a placeholder origin and requires the result to have stayed there — covering
absolute URLs, protocol-relative hosts, backslash smuggling and `javascript:` in
one rule.

---

## Conventions that bite

- **Next 16:** the auth gate is `src/proxy.ts` exporting `proxy`.
  `middleware.ts`/`middleware` is deprecated and **will not run**. `cookies()`,
  `headers()`, `params` and `searchParams` are all async.
- **Prisma 7:** `schema.prisma` carries no `url` — Migrate reads
  `prisma.config.ts`, and the runtime client needs the Neon adapter.
  [`lib/db.ts`](../src/lib/db.ts) exports `db` as a lazy `Proxy` so importing a
  module that mixes pure helpers with queries does not demand a live
  `DATABASE_URL`; the unit tests rely on this. Never replace it with a top-level
  `new PrismaClient()`.
- **Tailwind v4:** theme tokens live in an `@theme` block in
  [`globals.css`](../src/app/globals.css). There is no `tailwind.config.ts`.
- **Env is validated in slices** ([`lib/env.ts`](../src/lib/env.ts)): `authEnv()`
  and `storageEnv()` are memoised and parsed lazily, so a half-configured
  environment only fails where it is actually missing something. Both are
  server-only — never import them from a client component.
- **`next build` needs `DATABASE_URL`**, because prerendering runs the page
  queries.
- **Escape every literal `$` in `.env` as `\$`.** Next expands `$VAR`
  references when it loads the file, so an unescaped `$` silently collapses to
  an empty string. This bites bcrypt hashes especially. Quoting does not help.
- Comments in this codebase explain *why*, not what, and are dense. Match that
  register when editing.

---

## Testing

Every pure module in `src/lib/<concern>/` has a mirrored suite in
`tests/unit/<concern>/`. Around 357 unit tests (Vitest) plus three Playwright
specs covering the public site, the admin, and animation/transition behaviour.

Two things worth knowing before trusting a red run:

- **The e2e suite runs against the live Neon database and the real R2 bucket**,
  and reuses an already-running dev server locally. Its environment is whatever
  that server was started with.
- **Tests that assert animation fail on a machine with reduced motion enabled at
  the OS level** — the CSS correctly takes its reduced branch while the test
  asserts the full one. Three stills tests currently do this. Tests that care
  either way now set `emulateMedia` explicitly; these three predate that.

---

## Operations

### Backfills

Each is a dry run by default and takes `-- --apply` to write.

| Script | For |
| --- | --- |
| `npm run backfill:photos` | Re-compress and backfill stored photos |
| `npm run backfill:settings` | Populate `Photo.settings` on older rows |
| `npm run recolor:photos` | Re-derive OKLab colour stats. Imports the real analyser from `src/` rather than duplicating it, so the wall and the backfill cannot drift apart |
| `npm run backfill:durations` | Recover `Video.durationSeconds` for clips predating the column |

`backfill:durations` is the one place anything server-side looks inside a stored
video. It stays within the no-server-side-processing rule: it walks the MP4 box
structure over HTTP **range requests** to find `moov`, so a 900 MB clip costs
kilobytes and no frame is ever decoded. The parser is
[`lib/video/mp4.ts`](../src/lib/video/mp4.ts), under test. It exists only for
rows that predate the column — every clip uploaded since carries its duration
from the browser.

### Search, sharing, and the canonical origin

Everything a crawler or a link preview needs is generated, never checked in:
`app/icon.svg`, `app/opengraph-image.tsx` (an `ImageResponse` built at build time,
typographic rather than photographic so it cannot misrepresent a wall whose
contents change), `app/robots.ts`, and `app/sitemap.ts`. The sitemap reads the
database and excludes drafts in the query, matching `/journal`; it is static and
refreshed by the same `revalidatePath` calls that rebuild the pages it lists.

All four resolve their absolute URLs through
[`lib/site-url.ts`](../src/lib/site-url.ts), which prefers `NEXT_PUBLIC_SITE_URL`,
falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, and finally to localhost.
It deliberately ignores `VERCEL_URL` — that one is unique per deployment, so a
sitemap built from it would advertise a hostname that stops being the site as
soon as the next deploy lands. The same value feeds `metadataBase` in the root
layout, without which Next drops every relative Open Graph URL and a shared link
unfurls as bare text.

### Bucket setup no code here can do for you

- **`ExposeHeaders: ["ETag"]` in the CORS policy.** Multipart uploads cannot be
  completed without reading each part's ETag back, and the browser hides that
  header unless the bucket says otherwise.
- **An `AbortIncompleteMultipartUpload` lifecycle rule.** `uploadFile` aborts an
  upload it sees fail, but a closed tab never reaches that code — and the parts
  already sent stay stored, billed, and invisible in a normal object listing
  until something expires them.

`npm run check:r2` verifies credentials and bucket access.

### Release flow

**Planned, not yet in place.** Recorded here so the setup is done once and the
same way; nothing below is enforced by anything in the repo today.

Production is `main`. Work happens on `feature/*` and reaches production only
through a pull request — there is no integration branch, because with one author
a long-lived `preview` adds a promotion step without adding a gate that the PR
does not already provide.

What has to exist for that to mean anything:

- **A CI workflow on pull requests to `main`** — `lint`, `typecheck`, `test`,
  `build` — because a branch ruleset can only require checks that already exist.
  Note that `next build` needs a reachable `DATABASE_URL` (prerendering runs the
  page queries, see [Conventions that bite](#conventions-that-bite)), so CI needs
  a real connection string rather than a placeholder. E2E stays out
  of the required set: Playwright needs its own server and a seeded database, and
  a check that flakes gets bypassed, which trains the habit that defeats the
  ruleset.
- **A ruleset on `main`**: require a pull request, require those checks, block
  force pushes and deletion. Enable *do not allow bypassing* — a solo owner is an
  admin, and an unenforced ruleset is decoration.

**Vercel builds a preview for every branch push whether or not one is wanted.**
Each gets its own URL and its own live `/admin` — there is no development auth
bypass, but nothing makes a preview's *session* less powerful than a production
one either, and with environment variables left at Vercel's "All Environments"
default a preview reads and writes the live database and the production R2
bucket. That is the same trade local development already makes deliberately, so
it is accepted rather than fixed; what it means is that a preview URL is a
production admin console, and Deployment Protection should be on so it is not a
publicly reachable one. Vercel sends `x-robots-tag: noindex` on previews, but
that stops indexing, not visitors.

**The free tier is the live constraint, and image optimisation is what will
break it first.** Photos are the only media that takes the `next/image` hop —
video is served straight from R2, which keeps the largest bytes off Vercel's
bandwidth entirely — but a photo wall is a lot of distinct source images, and
Hobby meters *transformations*, not requests. Each preview deployment has its own
optimisation cache, so opening the wall on a preview re-transforms the same
photos that production already paid for. Two or three previews of a page that
renders the whole wall is the failure mode, not traffic.

Levers, cheapest first:

- **Watch the Usage tab, and set the usage notification.** Hobby has no spend
  cap; exceeding a limit pauses the project, so the notification is the only
  warning. Check the current limits there rather than trusting a number written
  here — Vercel changes them.
- **Skip preview builds you do not need**, via Settings → Git → Ignored Build
  Step. `[ "$VERCEL_GIT_COMMIT_REF" = "main" ]` builds only production; a
  `git commit -m '[skip ci] …'`-style opt-out per branch is the softer version.
  This saves build minutes, not transformations.
- **Do not browse the full wall on a preview** when the change under review is
  not about the wall. This sounds like advice rather than infrastructure, and it
  is, but it is the single biggest lever on the metric that actually binds.

`NEXT_PUBLIC_SITE_URL` should stay **unset** on Preview: with it set, every
preview claims to be the canonical origin in its metadata and sitemap. Note the
fallback in [`lib/site-url.ts`](../src/lib/site-url.ts) is
`VERCEL_PROJECT_PRODUCTION_URL`, the production host — deliberately, since
`VERCEL_URL` is per-deployment and would advertise a hostname that dies with the
next deploy. So a preview's link previews point at production. That is correct
for canonicalisation and confusing exactly once, when you share a preview link.

**Schema changes are not carried by the merge.** There is no migration history
in the repo — `npm run db:push` is the only path, and it is destructive-capable.
Merging a pull request promotes code, not schema, so a merge can ship code that
expects a column production does not have. Until this moves to `prisma migrate`
with committed migrations run as a deploy step, the rule is: **push the schema to
production before merging the code that needs it**, and keep the change additive
so the currently-deployed code survives the gap between the two.

---

## Known gaps

Ranked roughly by what they cost. The full list, with file references, is in
[`code-review-findings.md`](code-review-findings.md).

**Before this is genuinely production-ready:** nothing. All three launch
blockers are closed. What remains is ranked in
[`code-review-findings.md`](code-review-findings.md) and costs convenience
rather than correctness.

Closed 2026-08-07, the last blocker: a failed upload part is retried rather than
discarding the whole upload. Four attempts with exponential backoff, and only
for what a retry could fix — a dropped connection, 408, 429, 5xx. A 401/403 is a
session that expired mid-upload and fails at once instead of making the admin
wait out three backoffs for the same message. Each attempt re-signs the part URL,
because on the long uploads this matters for the presigned URL may itself be what
expired. The same pass made upload errors carry the route's own message, weighted
progress by bytes rather than by part, and made an empty blob say so.

Closed in the pre-deploy pass (2026-08-05): login now rate-limits — 8 wrong
passwords locks an address out for 15 minutes, in-memory and per-instance, see
`lib/auth/rate-limit.ts` — and both tag-set replacements are wrapped in one
`db.$transaction`, so a failed update can no longer leave the delete committed
and the item stripped of every tag.

Closed 2026-08-07: every media write now orders the row before the R2 object.
Nothing spans both stores transactionally, so the only choice is which half-done
state to accept, and an object nothing points at beats a public page serving a
404 — the orphan is invisible and costs pennies, and its URL is logged. Tag
upserts also went sequential, closing a unique-violation race between two saves
in flight.

Removed rather than fixed: the `DEV_SKIP_AUTH` development bypass and
`lib/auth/dev-bypass.ts`, deleted before launch. `/admin` now requires a real
session in every environment, which means local development needs a working
`ADMIN_PASSWORD_HASH` and `SESSION_SECRET` like anywhere else — a fair price,
given development points at the *live* Neon database and R2 bucket.

**Known rough edges, none blocking:**

- The lightbox declares `role="dialog"` but never moves, traps, or restores
  focus.
- Camera and location are matched exactly against free text that is never
  normalised on write, so `"Leica M6"` and `"leica m6 "` become two permanent
  filter chips.
- Media cannot be replaced, only deleted and re-created — losing the row's id,
  tags and `createdAt`.
- Upload progress counts parts, not bytes, so any file under 5 MiB jumps 0 → 100.
- Part size is pinned at the 5 MiB minimum with one signing round-trip per part,
  so a 1 GB video costs 200 sequential calls.
- Clips stored before the dimension columns existed carry `width`/`height` of 0
  and are drawn 16:9 on the roll, which is the wrong shape. The player recovers
  the true ratio from the file at runtime, so the clip page looks right either
  way. **Regenerate preview frames** on the clip's admin page fixes the row —
  it re-grabs the frames from the stored copy and writes the real dimensions and
  duration. Run it on any clip whose thumbnail looks the wrong shape.

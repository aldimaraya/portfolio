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

The single exception is
[`app/api/admin/photo-source`](../src/app/api/admin/photo-source/route.ts), an
admin-only same-origin read that lets the border trimmer get untainted canvas
pixels. It is session-gated and restricted to keys inside our own bucket.

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
  capturing dimensions and duration in the same metadata read.
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

### Bucket setup no code here can do for you

- **`ExposeHeaders: ["ETag"]` in the CORS policy.** Multipart uploads cannot be
  completed without reading each part's ETag back, and the browser hides that
  header unless the bucket says otherwise.
- **An `AbortIncompleteMultipartUpload` lifecycle rule.** `uploadFile` aborts an
  upload it sees fail, but a closed tab never reaches that code — and the parts
  already sent stay stored, billed, and invisible in a normal object listing
  until something expires them.

`npm run check:r2` verifies credentials and bucket access.

---

## Known gaps

Ranked roughly by what they cost. The full list, with file references, is in
[`code-review-findings.md`](code-review-findings.md).

**Before this is genuinely production-ready:**

1. **`DEV_SKIP_AUTH` and `lib/auth/dev-bypass.ts` are temporary** and must be
   deleted along with their call sites in `proxy.ts` and `guard.ts` (grep
   `DEV_SKIP_AUTH`). Outside production it disables the admin gate entirely.
   Note that development points at the *live* Neon database and R2 bucket.
2. **No rate limiting or lockout on login.** One static password, unlimited
   attempts. bcrypt(12) throttles a serial attacker but not concurrent ones, and
   each attempt burns a full-CPU serverless invocation — a credential risk and a
   billing amplifier at once. Needs a decision: in-memory counter (free,
   per-instance, resets on cold start) vs. durable KV.
3. **A failed update silently strips every tag** from a photo or video:
   `deleteMany` then `update`, unwrapped, so a failed update leaves the delete
   committed. Both need one transaction.
4. **One failed upload part discards the whole upload** — the exact failure
   multipart was adopted to prevent. Nothing retries a part.

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
- One clip (`Alaska Preview`) still has `width`/`height` of 0. The player
  recovers the true ratio from the file at runtime, so it looks right, but the
  row is wrong. The same box-walking parser could recover it from `tkhd`.

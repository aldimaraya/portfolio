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
| Motion | `/motion`, `/motion/[id]` | Clips grouped into rolls of film, each clip with its own page |
| Journal | `/journal`, `/journal/[slug]` | Posts — trips, day by day, and the things around them — built from blocks |
| Newsletter | `/newsletter`, `/newsletter/{confirm,manage}` | Email when something new goes up — see [Newsletter](#newsletter) |
| Admin | `/admin/**`, `/login` | One password-protected area managing all of it |

`/` is a home page summarising the other three — the latest posts, a justified
row of stills and a few clips dealt at random on every load, and the newsletter
signup — and it
carries the `WebSite` and `Person` JSON-LD, since it is where a search for the
name lands. It reuses each surface's own components rather than restyling them,
and every action that revalidates a surface revalidates `/` too. The deal happens
in the browser (`components/home/useVisitSeed.ts`) so that `/` stays static: the
page ships the newest 120 stills and every clip, and picks from them after
hydration. The public
pages share chrome through the
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
([`lib/video/sprite.ts`](../src/lib/video/sprite.ts)), the video re-encode
([`lib/video/transcode-client.ts`](../src/lib/video/transcode-client.ts)) and clip
duration all run client-side and are stored on the row. **There is no server-side
image or video processing anywhere.** Rendering a public page is a plain database
read.

The cost of this is that anything not captured at upload time is generally gone
for good, which is why several backfill scripts exist and why two columns have
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

### Video encoding happens in the browser, on pick

Clips are re-encoded to 1080p H.264 at ~6 Mbps before they reach R2, in the admin
browser, by [`lib/video/transcode-client.ts`](../src/lib/video/transcode-client.ts)
driving WebCodecs through [mediabunny](https://mediabunny.dev/). The OS hardware
encoder does the work; there is no ffmpeg and no wasm, and the constraint above —
no server-side video processing anywhere — is untouched. 4K masters still stay
offline: the encode is lossy and one-way, exactly as it is for stills.

The trigger is **bitrate, not file size**
([`lib/video/transcode.ts`](../src/lib/video/transcode.ts)). Size alone cannot
tell a fine ten-minute clip from an unencoded twenty-second one — both land near
200 MB and only one is a problem — so the threshold divides by duration and fires
past 25% over target, or whenever the long edge exceeds 1920. A clip already
within the band is uploaded untouched rather than paying for a second generation.

**Run as soon as the clip is picked.** Picking reads the container header, says
what it found, and starts the encode straight away, with a progress bar and a
Cancel; the title and tags are filled in while it runs, and save — held back until
it finishes — is then only an upload. An earlier version waited for save, so that
a clip swapped out or removed never cost an encode, but in use that read as
"nothing happens" for minutes and then a save that took minutes more. Swapping or
removing the clip now aborts the running encode instead, so the cost of an
abandoned pick is only the time already spent. Cancel drops the pick rather than
keeping the original, because uploading the unencoded master is what this exists
to prevent. Every async step checks a per-pick counter before writing back, so a
clip replaced mid-encode cannot land its result on its successor's form.

The frame grab runs *after* the encode and reads the encoded file, so the scrub
preview shows the bytes being published and the `width`/`height` it records
already describe them — no second measurement needed.

This used to be a manual `ffmpeg` step enforced by nothing but a warning in the
picker, which is a poor guard on a 10 GB bucket where media cannot be replaced in
place — only deleted and re-created.

**Desktop only.** A phone skips the step entirely — it is not even asked to size
the clip up, which also keeps the ~500 kB media library off a mobile connection.
The reason is memory rather than the encoder: the output is buffered whole before
upload, at roughly 45 MB per minute, and a phone is killed for that long before a
laptop notices. iOS also suspends background tabs, so switching apps mid-encode
loses the work with no way to resume, and a phone's own footage is the worst case
regardless — 4K HEVC trips the threshold every time. iPads count as desktop,
because iPadOS Safari has claimed to be a Mac since iPadOS 13 and cannot be told
apart; they have the memory and the encoder, so that is the right way to be
wrong. Lifting this means moving off `BufferTarget` to a streaming target that
feeds the multipart uploader as it encodes.

Four things degrade rather than block, because a clip the pipeline cannot
improve is still a clip worth publishing:

- **A video track the browser cannot decode** (ProRes, and other pro codecs)
  fails `canDecode()` and is uploaded as-is with a note saying to encode it
  locally.
- **An audio track that cannot be carried over** is refused outright. This one
  needs saying because mediabunny does not fail on it: a discarded track leaves
  the conversion *valid*, since a video-only file is a valid file, so the default
  behaviour is to publish a silent clip. Safari before 26 ships WebCodecs without
  any audio classes at all, so this is not hypothetical. The original is uploaded
  instead — larger, but with its sound.
- **An encode that came out no smaller** than the original is discarded and the
  original kept — unless it was fixing the audio, where the original is silent.
- **An encode that throws** falls back to uploading the original.

Audio is copied, not re-encoded, whenever it is already AAC. The exception is the
uncompressed PCM that [`lib/video/audio.ts`](../src/lib/video/audio.ts) warns
about — no browser can decode it, and it was the cause of a long-running "clips
play silently" bug. Unplayable audio is a trigger in its own right
(`needsAudioEncode`, from the codec `probeVideo` reads): a clip whose video is
already within target still goes through the encoder, but with the video copied
packet for packet and only the audio re-encoded, so fixing the sound never costs
the picture a generation. The warning is checked against the file actually being
uploaded, so it appears only when that fix could not happen — on a phone, or when
the browser could not encode AAC and the original went up instead.

Regenerating a clip's preview frames deliberately does **not** re-encode: the
stored clip already is the encode, and running it through again would cost a
generation every time a preview was redone.

---

## Features, surface by surface

### Stills

- **Colour-sorted wall.** Justified rows, order derived as described above.
  The visitor can re-sort it — newest, oldest, **most liked**, cool → warm,
  warm → cool, or a seeded shuffle — from `?sort=`, on the client. *Most liked*
  holds the wall until the likes arrive (see [Likes and views](#likes-and-views))
  rather than drawing it newest-first and re-sorting, because the lightbox
  tracks its photo by position. Ties, which is most of a young library, fall
  back to newest first. The order uses the likes as first fetched and does not
  move as the visitor likes things, for the same reason.
- **Filters** — camera, location, and tags. **OR within a type, AND across
  types**, held in the URL query string
  ([`lib/filters/parse.ts`](../src/lib/filters/parse.ts) ↔
  [`apply.ts`](../src/lib/filters/apply.ts)) so a filtered view is shareable.
  Filtering happens in the browser: the page reads no `searchParams`, because a
  page that reads them is dynamic by definition, and the wall already needs
  every photo to pack its rows.
- **Lightbox** with swipe, keyboard navigation, and a FLIP expand from the
  clicked frame. The caption carries the date and capture settings.
- **Optional titles.** A titled photo prints its title as the caption's bold line
  and demotes the location to the meta line; untitled, it reads as it always did.
  The wall and the lightbox share one builder,
  [`lib/photo/caption.ts`](../src/lib/photo/caption.ts). Titles are not a filter
  facet and the admin offers no suggestions for them.
- **Load-time placeholders** painted from the photo's own average colour, and a
  wall-level loading state gated on real image `load` events rather than a timer
  ([`useAssetsReady`](../src/components/site/useAssetsReady.ts)). The same gate —
  hold the cascade, show the "Developing" loader after a 180ms grace and for at
  least 400ms once shown, open by 2.5s regardless — also covers the first rows of
  `/motion` and the home page's strip and clips
  ([`AssetGate`](../src/components/site/AssetGate.tsx)). While any gate is shut the
  page counts as busy, and the click-to-ready progress bar
  ([`NavigationProgress`](../src/components/site/NavigationProgress.tsx)) keeps
  running through it, so a click, the loader and the cascade read as one wait.

### Motion

- **Rolls** (`/motion`) are stacked down the page, each its own strip: a
  heading (`Roll A — Travel`, clip count, running time, optional description),
  then a 26px perforated film rail down the left with clips as rows, on ordinary
  page scroll. Rolls are lettered A, B, C… by position and a clip's frame code
  carries its roll's letter (`01A`, `01B`), so reordering rolls renumbers every
  clip on them. Empty rolls are not shown, and lettering skips them.
  [`lib/video/roll.ts`](../src/lib/video/roll.ts) does the grouping for both
  `/motion` and the clip pages, so the two cannot disagree about a frame code. Each row shows a sprite-sheet
  thumbnail, title, description and running time. Sprite previews animate on
  hover or keyboard focus only — six looping previews down a list is ambient
  motion competing for attention.
- **A clip page** (`/motion/[id]`) per clip: the projector gate, the title, its
  position on its roll, its running time, and prev/next along that roll —
  stopping at the roll's ends rather than splicing into the next one. "Back"
  returns to the clip's roll (`/motion#roll-b`), not the top of the page. SSG,
  like a journal post.
- **Clips run on arrival**, started from an effect rather than the `autoPlay`
  attribute — the attribute gives no way to learn that the browser refused,
  which is the case that has to be handled. Refused, the poster stays up with a
  play control. Not muted-to-force-it: these clips are graded and mixed.
- **The gate is sized against the window**, not a fixed pixel cap, so the frame,
  its title and its place on the roll are visible at once. `svh` rather than
  `vh`, because `vh` measures the viewport with mobile browser chrome retracted.
- **The projector**: a sticky spool at the head of each roll's rail turning
  with the scroll, and a gate spool on a clip page that turns only while the clip runs.

### Journal

A post is a list of **blocks**, stored as JSON on `BlogPost.content` and
validated by [`lib/post/content.ts`](../src/lib/post/content.ts) on every save and
read: sections, text, headings, photos, tips, lists with notes, clips, YouTube
embeds, quotes and dividers. That schema is the whole vocabulary — there is no
HTML or Markdown block, and the renderer builds every element itself, so nothing a
post contains can become markup. Rich text inside a block is the subset of
ProseMirror JSON the editor emits (paragraphs, lists, bold, italic, links), with
links held to http(s), mailto and on-site targets.

- **The sheet** ([`PostSheet`](../src/components/journal/PostSheet.tsx)) spans the
  full container like stills and motion, without the lines growing with it: a
  margin for dates and section labels, a text column at a reading measure, and a
  rail holding the **"In this post"** index, which stays in view and marks the
  section being read. Photos set *wide* take the margin too; *full* runs to both
  edges of the sheet, over the rail. Within that width a photos block can be
  scaled down (20–100%, by dragging its edge in the editor; stored as `scale`),
  and stacked photos and rows are always held under 80svh tall, so a portrait
  never runs past the screen ([`fit.ts`](../src/lib/post/fit.ts)). On a phone a
  scale is honoured only down to 60%. Every breakpoint is a **container query** on
  `.post-frame`, not a media query, so the editor's phone preview — a narrow
  sheet in a wide window — collapses exactly as a phone does: the index moves
  under the title, then the margin moves above each block.
- **Sections** divide a post. A *numbered* section is a day, labelled "Day N" by
  its position, so moving one renumbers the rest; renaming it ("Arrival") keeps
  its place in the count, so the days after it do not renumber. A *plain*
  section ("Packing") is not counted. Both feed the index
  ([`lib/post/sections.ts`](../src/lib/post/sections.ts)); a post with no sections
  indexes its headings instead.
- **Photos blocks** hold references, not URLs — a trip photo, a still off the
  wall, or (for converted posts only) an outside URL — and lay them out
  *stacked*, as a justified *row*, a *grid* or a *carousel* (a native
  scroll-snap track; the script only adds buttons and the counter). A reference
  whose row is gone is skipped, so deleting a still drops it from the posts that
  used it; `deletePhoto` and `deleteVideo` revalidate the journal for that.
- **Trip photos** are `JournalPhoto` rows, owned by one post and deleted with it,
  and **never on the stills wall** — the wall is curated in its own admin. They
  are uploaded from the editor's tray through the same browser-side path as a
  still (EXIF read first for the capture date, then re-encoded so no GPS reaches
  the bucket). The tray groups them by **day** — the camera's wall-clock date,
  stored in UTC fields so the day is the same everywhere
  ([`lib/post/trip.ts`](../src/lib/post/trip.ts)) — and by a fixed set of
  **categories** (food, sights, getting around, stay, people). *Lay out days*
  turns every day with no section yet into a numbered section with a text block
  and the photos for each category, leaving only the words to write. An upload
  that looks like a photo already in the post is **skipped before it is sent**,
  with *Upload anyway* to override: each row carries a 64-bit perceptual hash
  ([`lib/photo/fingerprint.ts`](../src/lib/photo/fingerprint.ts)) of the picture
  rather than the file, since only the re-encoded copy is ever stored. A skipped
  original still gives the stored copy any **date or location it is missing** —
  re-picking the originals is how a photo uploaded before either was kept gets
  them back.
- **Places.** The GPS fix is read alongside the capture date, before the
  re-encode strips it from the file, rounded to ~110 m, and kept on the row only
  so it can be named: `addJournalPhoto` turns it into a town-sized place
  ([`lib/geo/`](../src/lib/geo)) through OpenStreetMap's Nominatim — no key, one
  request a second, server-side so it can identify itself, and the attribution
  shown in the tray as its terms require. A stored row at the same rounded point
  lends its name first, so the database is the lookup's cache and a typed
  correction is inherited. **The coordinates are never selected into anything a
  browser receives**, the admin included; only the name is shown. The tray
  groups by place and sets one by hand for photos without GPS. Nothing public
  shows places yet.
- **The editor** (`components/admin/post-editor/`) draws the post on the same
  sheet, each block edited in place: text through TipTap with everything the
  schema cannot hold switched off, so a paste is reduced to what a post can
  store; titles, labels and captions as plain growing fields. The selected
  block's controls sit in a row of the sticky top bar, never over the writing.
  New posts are created as an empty draft first, so photos can be uploaded into
  one before its first save. Saving is explicit (Save, or ⌘S) — a published post
  would otherwise go live keystroke by keystroke — and leaving unsaved asks
  first. Every decision about what an edit does is a pure function in
  [`lib/post/editor.ts`](../src/lib/post/editor.ts).
- **Posts written in Markdown** before the editor have `content` null. They are
  converted on read ([`lib/markdown/legacy.ts`](../src/lib/markdown/legacy.ts)),
  following what the old renderer made of each shape, with images and videos
  from the library matched back to their rows; the first save from the editor
  stores the blocks. Nothing is rewritten behind the writer's back, and
  `markdownContent` is never written again.
- **Drafts** 404 rather than being a private page, and are left out of
  `generateStaticParams` entirely. A draft's title can be empty; publishing needs
  a title and something to read
  ([`lib/post/form.ts`](../src/lib/post/form.ts)).
- Slugs from titles, with collisions suffixed
  ([`lib/slug.ts`](../src/lib/slug.ts)), frozen on publish.
- Excerpts from the post's prose for the list, link previews and the newsletter
  ([`lib/post/excerpt.ts`](../src/lib/post/excerpt.ts)); a post's link preview
  uses its first photo.

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
- **A custom thumbnail** can replace the grabbed poster, on upload or later from
  the edit page: an image picked by hand, shown until the clip is hovered and
  before it plays. It goes in the same `posterImageUrl`, so every reader picks it
  up unchanged, and is always re-encoded through a canvas (1280px, WebP or JPEG)
  so a phone photo's GPS is never published. Covers live under `covers/` rather
  than `posters/`, which is how the form tells one from a grabbed frame without a
  column ([`lib/video/cover.ts`](../src/lib/video/cover.ts)) — and why
  Regenerate redoes the strip but leaves a cover in place.
- **A YouTube link** can be attached to any clip, for one whose 4K cut is on
  YouTube — what reaches R2 is our own 1080p encode, and 4K masters stay offline.
  The clip page offers it as a `4K ↗` link in the gate's slate rather than an
  embedded player, so the page loads no YouTube script or cookie unless the
  visitor follows it.
- **Rolls** are renamed, reordered and deleted on their own headings in the
  `/admin/videos` clip list, and added at its foot. A roll with clips on it
  cannot be deleted — the admin says so, and `onDelete: Restrict` guarantees
  it. A clip's roll can also be picked on its form; moving it that way puts it
  at the end of the new roll.
- **Drag-to-reorder** for videos, one list per roll — and across them, to move
  a clip onto another roll, landing above or below the row by pointer position.
  Persisted as the destination roll's whole ordering in one transaction rather
  than a moved pair, so the result cannot drift from what is on screen.
- **Links** (`/admin/links`) are the outbound links drawn as icons beside the
  wordmark and again in the footer of every public page. Added, edited,
  reordered and deleted in place; each save revalidates the whole site, because
  every page carries them. The icon is derived from the URL's host
  ([`lib/links/link.ts`](../src/lib/links/link.ts)), never stored, and a host
  with no mark is drawn as its label. URLs are pinned to http(s) — the string
  becomes an `href` on every public page — and lose share-tracking parameters
  (`si`, `igsh`, `utm_*`) on the way in. Links marked as the owner's account
  become the Person schema's `sameAs` and carry `rel="me"`.
- **`AdminBar` and `AdminEditLink`** appear on public pages for a signed-in
  admin — the bar as a collapsed button fixed bottom-left, so it never shifts
  the page's layout. They ask the client (`/api/auth/state`) rather than reading `cookies()`,
  because a cookie read would make the page dynamic and lose the CDN.

### Newsletter

Visitors can get an email when something new goes up, choosing any of journal,
motion and stills. There is **no schedule**: the site is updated occasionally,
and a weekly newsletter would mostly be empty. Code in
[`lib/newsletter/`](../src/lib/newsletter), sending through Resend.

- **Publishing queues, the cron sends.** `savePost` (on a post's first publish),
  `savePhoto` and `saveVideo` (on create, never on edit) call `announce()`,
  which adds an `Announcement`. A daily Vercel Cron
  (`vercel.json` → `/api/cron/newsletter`, authorised by `CRON_SECRET`) sends
  everything pending as one `Dispatch` once nothing new has been added for
  `QUIET_HOURS` ([`schedule.ts`](../src/lib/newsletter/schedule.ts)). That is
  the bundling: an afternoon of uploads is one email the next day, and a quiet
  month is no email at all. Each subscriber gets only the kinds they chose, and
  nothing if the batch holds none of them.
- **An item is announced once, ever** — the unique index on `(kind, refId)`.
  Unpublishing and republishing a post does not email anyone twice. A post put
  back into draft while pending is held, not sent; deleted content is dropped.
- **Dispatches resume.** Each subscriber's `lastDispatchId` records that they
  have been handled, so a run that dies or hits Resend's daily cap is finished
  by the next one, and each batch of 100 carries an idempotency key derived from
  its recipients so a retry after a crash is not a duplicate. Only one dispatch
  runs at a time; a second racing run claims no items and backs out.
- **`/admin/newsletter`** shows the pending batch with an estimate of when it
  goes out, lets an item be left out (or put back), renders the exact email as a
  preview, has **Send now** and **Email me a preview**, and lists subscribers
  and past sends. An unconfirmed subscriber can be confirmed from there by hand,
  for someone known to want it who never clicked the link.
- **Double opt-in, no accounts.** A random token per subscriber is the whole
  credential behind the confirm, manage and unsubscribe links. Confirming takes
  a click on the page, not just a GET — mail scanners fetch every link in an
  email, and a GET that confirmed would let one sign someone up. Unconfirmed
  signups are deleted after a week; unsubscribing deletes the row.
- **Every digest carries RFC 8058 one-click unsubscribe headers**, which Gmail
  and Yahoo expect from bulk senders. Only the POST acts on
  `/api/newsletter/unsubscribe`, for the same scanner reason.
- **The signup form reveals nothing.** Every outcome — new, pending, already
  subscribed — gets the same answer. It has a honeypot field, a per-IP cap
  ([`throttle.ts`](../src/lib/newsletter/throttle.ts), in-memory like the login
  limiter) and a per-inbox resend limit, because every signup spends quota.
- **The prompt** ([`NewsletterPrompt`](../src/components/newsletter/NewsletterPrompt.tsx))
  is a native `<dialog>` opened after 20 seconds, mounted in the public layout
  so its clock survives navigation. It never shows to the admin, on the
  newsletter's own pages, or over an open photo, and never again in a browser
  that has closed it or subscribed (localStorage, best-effort). A footer link
  on every public page is the permanent way in.
- **Only production can email subscribers.** Development and previews share
  production's database, so [`send.ts`](../src/lib/newsletter/send.ts) drops
  every recipient not in `NEWSLETTER_TEST_EMAIL` unless `VERCEL_ENV` is
  `production`, and `runDispatch` refuses to run at all elsewhere — a dispatch
  there would mark real subscribers as sent while delivering nothing. Keep
  `RESEND_API_KEY` scoped to Production in Vercel as the second lock.
- **Outside production, email links point back at the request's own origin**
  ([`origin.ts`](../src/lib/newsletter/origin.ts)), so a confirmation sent from
  `localhost` confirms on `localhost` rather than on a production that has not
  shipped the page yet. Images still load from `siteUrl()`, because a mail
  provider's image proxy cannot reach localhost.
- Email images go through the site's own `/_next/image` at 640px, since the
  originals on R2 are full size. That spends image transformations, once per
  image.

### Likes and views

A still can be **liked** in the lightbox, under its caption; a clip and a
journal post can be liked and show how many times they have been **viewed** —
the clip's like and views on its title line, the post's views in its margin
under the date and its like both under the title and at the foot. Both counts
are public. A like count of zero prints nothing beside the heart; a view count
of zero prints "0 views", because a counter that is blank until the first view
reads as missing. Code in
[`lib/engagement/`](../src/lib/engagement), served by `/api/engagement`.

- **Counts are fetched after hydration, never rendered into the page.** Every
  public page is static and its HTML is shared by every visitor, so it cannot
  say whether *this* visitor liked something, and a count baked into it would
  need a revalidation per click. [`useEngagement`](../src/components/engagement/useEngagement.ts)
  asks the API once per item — in the same `useSyncExternalStore` shape as
  `useIsAdmin` — and the heart sits faded and disabled until it hears back.
  A clip or post page's one request is `POST /api/engagement/view`, which
  records the view and answers with the counts; the lightbox asks for every
  still's likes in one `GET`, the first time it opens.
- **No accounts, so two stand-ins.** A like belongs to a random id in an
  httpOnly cookie, set only on the first click — a cookie for something the
  visitor asked for, not one that follows them around. The table holds a
  sha256 of the id, never the id. A view sets no cookie: it is one row per
  visitor per item per UTC day, the visitor being an HMAC of address and user
  agent under a key HKDF-derived from `SESSION_SECRET` *and the day*, so a
  reload does not count twice, no address is stored, and one day's hashes
  cannot be matched to the next. Clearing cookies makes a visitor new, and that
  is accepted: a like is a gesture, not a vote.
- **A like is set, not toggled** — the request says `liked: true|false`, so two
  clicks racing end where the last one left it, and the client sends at most
  one request per item at a time. It is optimistic, and rolled back to what the
  server last said if refused.
- **Views count only in production, and never the admin's.** Development and
  previews share production's database, and every reload while working on a
  page would otherwise be a view. Likes are recorded everywhere, since the same
  browser can take one back. Self-announced bots are not counted either.
- **Abuse is made slow, not impossible.** Likes are only written for an item a
  visitor could actually see (a draft post is not one), and each address has an
  hourly budget for likes and for views
  ([`throttle.ts`](../src/lib/engagement/throttle.ts), in-memory like the other
  limiters, with the same accepted trade).
- **Deleting content drops its rows** (`forgetEngagement`, called by the three
  delete actions after the content row has gone, and unable to fail them).
- **Comments are not built.** They were scoped out of the first pass; with no
  accounts they would need moderation in `/admin` before anything was shown.

---

## Data model

[`prisma/schema.prisma`](../prisma/schema.prisma). Fourteen models: `Photo`, `Video`,
`Roll`, `BlogPost`, `JournalPhoto`, `Tag`, the two join tables, the newsletter's
`Subscriber`, `Announcement` and `Dispatch`, `SiteLink`, and `Like` and `View`.

Columns whose *shape* carries a decision:

| Column | Why it looks like that |
| --- | --- |
| `Photo.settings` (`Json`) | Lens/focal length/aperture/shutter/ISO as one blob, every field optional free text. Read it back through `toSettings()`, which coerces malformed JSON to blanks rather than throwing. |
| `Photo.title` | `''` means untitled, not null, so the column could be added with `db push` and no backfill. |
| `Photo.warmth` | The wall's sort key. Defaults to 0, which files un-analysed rows as perfectly neutral until `recolor:photos` runs. |
| `Photo.takenAt` (nullable) | Null means unknown, and unknown is permanent — see the EXIF constraint above. |
| `Photo.hueStrength` | **Dead column.** Left declared only so `db push` stays additive; dropping it needs `--accept-data-loss`. Safe to drop by hand. |
| `Video.width/height` | Default 0, meaning "uploaded before these were stored". `FRAME_FALLBACK_RATIO` shapes those, and the clip page corrects itself from the file's own metadata. |
| `Video.durationSeconds` | `Float`, default 0 meaning unknown. Rounding on the way in would make the roll's running total drift. |
| `Video.youtubeId` | Default `""`, meaning no YouTube copy. Holds the 11-character id, never the pasted link, so share-link tracking parameters are not published; the clip page rebuilds the watch URL from it. |
| `Video.sortOrder` | Videos *do* have a manual order, unlike photos — but only within their roll; values on different rolls are not comparable. |
| `Video.rollId` (nullable) | Nullable only so the push stayed additive. `saveVideo` requires one; a clip without one (older than rolls, until `backfill:rolls` runs) is shown at the end of the first roll rather than dropped. |
| `SiteLink` (no icon column) | The mark is derived from `href`'s host at render, so a row cannot name one brand's icon and point at another's site. |
| `BlogPost.draft` | Defaults to `true`, so a half-written post cannot be published by forgetting a checkbox. |
| `BlogPost.content` (`Json`, nullable) | The post as blocks (`PostContent`). Null means the post predates the block editor and its body is still `markdownContent`, converted on read; validated on every read, and a row that fails falls back to the Markdown rather than taking the page down. |
| `BlogPost.markdownContent` | Read only for posts whose `content` is null, never written by the editor. Kept so the change stayed additive; droppable once every post has been saved from the editor. |
| `JournalPhoto` | A post's own uploads, apart from `Photo` so a trip never reaches the stills wall. `onDelete: Cascade` from the post; the R2 objects are `deletePost`'s to remove. `category` is a string, not an enum, so the list can change without a schema change. |
| `JournalPhoto.takenAt` | The camera's wall-clock time in UTC fields, so a trip's days are the same on every machine. Like `Photo.takenAt`, unrecoverable once the upload has stripped EXIF. |
| `JournalPhoto.latitude` / `longitude` / `place` | GPS rounded to three decimals, and the name it was given (or one typed over it). The coordinates stay server-side — `JOURNAL_PHOTO_SELECT` and every public select leave them out. Unrecoverable for photos uploaded before they were kept, except by re-picking the original. |
| `JournalPhoto.fingerprint` | Difference hash of the stored image, for the tray's duplicate check. Null on rows from before it existed until `npm run backfill:fingerprints` fills them; a null never matches. |
| `Announcement.refId` | Points at a `Photo`, `Video` or `BlogPost` depending on `kind`, so it cannot be a foreign key; deleted content is dropped when the batch resolves. |
| `Announcement.dispatchId` | `onDelete: Restrict`. Deleting a dispatch must not put what it sent back into the queue. |
| `Like` / `View` | Rows, not counter columns on the content tables: the rows are needed anyway to stop one visitor counting twice, and a count derived from them cannot drift. `refId` is not a foreign key, for `Announcement.refId`'s reason. The primary key leads with `(kind, refId)`, which is the index every count uses. |
| `Like.visitor` / `View.visitor` | Hashes, never the cookie or the address — see [Likes and views](#likes-and-views). A `View` hash is only stable within its `day`. |
| `Subscriber.lastDispatchId` | What makes a dispatch resumable. Not a relation, so dispatch history can never be blocked by it. |

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
| `npm run backfill:rolls` | File clips predating rolls onto the first roll, creating one (`-- --name …`, default `Films`) if none exists. Only `rollId` is written, so the old order carries over |

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

`RESEND_API_KEY`, `EMAIL_FROM` and `CRON_SECRET` should be set on **Production
only**. A preview shares production's subscriber list, and without the key it
cannot email anyone even if the guard in `lib/newsletter/send.ts` were wrong.

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

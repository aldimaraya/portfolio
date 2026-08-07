# Code review findings

Fresh-eyes review of the whole codebase, ordered by how much the bug actually
costs you: exposure and money first, then data loss, then correctness, then
polish. Original per-feature IDs are kept in the `#` column so they can be traced
back; the feature-by-feature notes are in the appendix.

Delete a finding when it is fixed, or mark it `WONTFIX` with a reason.

**Security findings do not go in this file.** This repository is public, and the
value of this document is that it is candid — which is exactly the wrong property
for an unfixed weakness in a live site sitting next to the source code for it.
Report those as a [private security advisory](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/about-repository-security-advisories),
which stays invisible until published, or fix them before they are written down
anywhere. Tier 0 below stays as a category for privacy and cost — a bill that
runs away is not a vulnerability — but anything that lets someone *in* belongs in
an advisory instead.

Reviewed against the code on 2026-08-04; the pre-deploy pass on 2026-08-05 closed
1.1 and 8.2. A second full pass on 2026-08-06 added the findings numbered `N1`–`N12`,
which cover the surfaces that did not exist when the first list was written — the
journal's media picker and Markdown renderer, the clip page, the audio-codec
check, and everything the static-rendering rework of #5 moved into the browser.
Findings that describe code which no longer exists have been struck through and
annotated rather than deleted, so the reasoning stays traceable. The open ones
here are the same list summarised under [Known gaps](architecture.md#known-gaps).

---

## Tier 0 — Privacy, security, and money

Things that leak data, let someone in, or bill you while you sleep.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| ~~1~~ | ~~3.1~~ | **FIXED.** Photo GPS and camera serials were published to a public bucket whenever the WebP re-encode came out no smaller, because only the re-encode path strips EXIF. `keepsOriginal` now refuses to keep any file carrying metadata, so the size optimisation still applies to stripped web exports — the case it was aimed at — and nothing with location data in it is uploaded verbatim. `prepareUpload` defaults the flag to "has metadata" so an uninformed caller gets the safe answer. Covered by a test. | `lib/photo/trim-client.ts` |
| ~~2~~ | ~~2.2~~ | **FIXED.** `uploadFile` now aborts the multipart upload on any failure via a new `POST /api/upload/abort`, best-effort so the abort never masks the real error. The closed-tab case the browser cannot report is covered by the `AbortIncompleteMultipartUpload` lifecycle rule, now documented as required bucket setup in the README alongside the CORS `ExposeHeaders` requirement. | `lib/storage/upload-client.ts`, `app/api/upload/abort/route.ts` |
| ~~3~~ | ~~1.1~~ | **FIXED.** The decision went to the in-memory counter: `lib/auth/rate-limit.ts` locks an address out for 15 minutes after 8 wrong passwords, checked before the body is parsed and long before bcrypt, so a locked-out caller costs nothing to turn away. A correct password clears the count. The window re-arms on each failure, so a slow trickle cannot sit under the limit forever, and the map is capped and pruned so a spoofed-IP flood cannot grow it without bound. `clientKey` takes the *first* `x-forwarded-for` entry, since Vercel's proxy rewrites the header and a forged one arrives as `evil, real`. Accepted limit: state is per-instance and lost on a cold start, so a distributed attacker gets more than 8 total — it stops the attack that actually exists (one source, one warm instance) for free. Twelve tests cover it. | `lib/auth/rate-limit.ts`, `app/api/auth/login/route.ts` |
| ~~4~~ | ~~1.2~~ | **FIXED.** The signing key is now derived with HKDF-SHA256 from `SESSION_SECRET` (key material) and `ADMIN_PASSWORD_HASH` (salt), so changing the password regenerates the bcrypt salt, changes the key, and invalidates every token issued under the old password. Derivation is cached per process, since neither input can change without a restart. Two tests cover it: a token issued under the previous password is rejected, and new tokens still work. | `lib/auth/session.ts` |
| ~~5~~ | ~~8.1 + 4.2~~ | **FIXED.** All four public routes are now static or SSG (verified in the build output), so a visitor is served from the CDN and the existing `revalidatePath` calls are load-bearing rather than inert. Three things had to move: `AdminBar`/`AdminEditLink` read the session through a client hook against `/api/auth/state` instead of `cookies()` in the layout; `/stills` stopped reading `searchParams` and filters in the browser instead; `/journal/[slug]` gained `generateStaticParams`. The stills query also drops to a column projection with a single round-trip — the second facet scan is gone, since facets derive from the photos already fetched. **Note:** `next build` now needs `DATABASE_URL`, because prerendering runs the page queries. | `app/(site)/*/page.tsx` |
| ~~6~~ | ~~1.5~~ | **FIXED.** `safeNext` was prefix-matching, which let `/\evil.example` through. Replaced by `safeNextPath` in `lib/auth/next-path.ts` — resolves against a placeholder origin and requires the result to have stayed there, which covers absolute URLs, protocol-relative hosts, backslash smuggling and `javascript:` in one rule. Moved out of the page file so it is testable; eight cases pinned (closes the `safeNext` half of 1.8). | `lib/auth/next-path.ts` |
| ~~7~~ | ~~1.3~~ | **FIXED.** `jwtVerify` now pins `algorithms: ['HS256']` explicitly rather than relying on jose's key-type inference. | `lib/auth/session.ts` |
| ~~8~~ | ~~1.4~~ | **FIXED.** Tokens now carry and verify an issuer (`portfolio`) and audience (`portfolio-admin`). Note: this invalidates existing sessions — everyone signs in again once on deploy. Covered by a test that a correctly signed token issued for something else is rejected. | `lib/auth/session.ts` |
| ~~9~~ | ~~1.7~~ | **FIXED.** Logout compares `Origin` against the request's own host. A missing `Origin` is allowed — same-origin form posts omit it, and a forced sign-out is the entire stake. | `app/api/auth/logout/route.ts` |

## Tier 1 — Data loss and integrity

Things that destroy or corrupt content that cannot be recovered from the UI.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| ~~10~~ | ~~8.2~~ | **FIXED.** Both tag-set replacements are now a single `db.$transaction([deleteMany, update])` — the array form rather than an interactive callback, since the two statements need nothing from each other and a batch transaction is the cheaper round-trip. | `app/admin/photos/actions.ts`, `app/admin/videos/actions.ts` |
| 11 | 2.1 | **One failed part discards the entire upload** — the exact failure multipart was adopted to prevent. The module header promises parts "can be retried"; nothing retries them. All of the complexity, none of the payoff. A bounded retry with backoff around the PUT is ~15 lines. | `lib/storage/upload-client.ts:70` |
| 12 | N12 | **Deleting a photo or clip silently breaks every published post that embeds it.** `listPostMedia` exists so a post can reuse library media, and `mediaSnippet` writes the R2 URL straight into the body — but nothing records that the post points at that row. `deletePhoto`/`deleteVideo` drop the object and revalidate `/stills` and `/motion`; the journal pages, which are prerendered, keep serving a cached page whose image is now a 404. There is no back-reference to warn from and no way to find the damage afterwards. Cheapest honest fix is a scan of `blogPost.markdownContent` for the URL before deleting, and a refusal — or at minimum a `revalidatePath('/journal', 'layout')` so the breakage is at least visible. | `app/admin/photos/actions.ts:129`, `app/admin/videos/actions.ts:135` |
| 13 | 8.3 | `deletePhoto` removes the R2 object before the row. The stated reasoning is sound, but the accepted failure — row delete fails after the object is gone — leaves a live row pointing at a 404 on the public wall. Only one of the two risks is named in the comment. | `app/admin/photos/actions.ts:138` |
| 14 | N2 | **`saveVideo` drops the replaced poster and sprite before the write that stops pointing at them** — the same shape as 8.3, in the mirror direction, and here the comment argues for the ordering without naming the risk it takes. The delete is at `:68`, the `$transaction` that repoints the row at `:74`; a transaction failure in between leaves a live clip on the public roll whose poster and scrub strip are both 404s. `retouchPhoto` faces the identical choice twelve lines away and resolves it the *other* way, with a written justification — the two should not disagree silently. | `app/admin/videos/actions.ts:68` |
| 15 | 6.1 | `once()` never times out, so a video the browser accepts but cannot seek hangs `generateSpriteSheet` forever with the form stuck busy and no error. The admin's only recovery is a reload, losing the filled-in form. | `lib/video/sprite.ts:34` |
| 16 | N3 | **Every server action's `{ error }` contract stops at the validation boundary.** Auth and Zod failures return a message the form renders; a Prisma failure throws straight out of the action, so the client's `if (result.error)` branch never runs and the admin gets an unhandled rejection with nothing on screen. `reorderVideos` is the sharpest case — it accepts any id list and updates each in a transaction, so a drag against a list holding a since-deleted clip throws `P2025` and the reorder appears to do nothing at all. A `try`/`catch` returning `{ error }` at the end of each action closes the whole class. | `app/admin/videos/actions.ts:114`, `app/admin/photos/actions.ts:39`, `app/admin/posts/actions.ts:37` |
| 17 | 8.4 | `tagConnections` fires concurrent upserts via `Promise.all` — a classic unique-violation race in Postgres. Will not bite with one admin; sequential is free. | `lib/tags/index.ts:15` |

## Tier 2 — Correctness and user-facing behaviour

Wrong output, wrong order, or a dead end for the person using it.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| 18 | N4 | **The lightbox throws if the photo set shrinks underneath it.** `Lightbox` reads `photos[index]` at `:52` and dereferences `photo.id` in a hook dependency array at `:139`; the `if (!photo) return null` guard that was written for exactly this case sits at `:297`, after every hook, so it can never be reached. `PolaroidWall` holds `openIndex` as a bare index and never clamps it when `photos` changes. Filtering is now a client-side re-render of the same component tree rather than a navigation, so a back/forward step onto a narrower filter with the lightbox open re-renders it against a shorter array and takes the page down with a `TypeError`. Move the guard above the hooks, and clamp or close `openIndex` when `photos` changes. | `components/stills/Lightbox.tsx:52`, `components/stills/PolaroidWall.tsx:76` |
| 19 | N5 | **A camera or location containing a comma cannot be filtered at all.** `serializeFilters` joins the selected values with `,` and `readList` splits on `,`, so a chip for "Seoul, Korea" round-trips through the URL as two values — `Seoul` and `Korea` — and `matchesAny` compares both against the whole string. Clicking a chip empties the wall, which reads as "no photos match" rather than as a bug. Both fields are free text typed by hand and neither is validated against the separator. Same root as 5.1 and worth fixing with it: repeat the key (`?location=a&location=b`) instead of packing one value. | `lib/filters/parse.ts:34` |
| 20 | 5.1 | Camera and location are matched exactly against free text that is never normalised on write, so "Leica M6" and "leica m6 " become two permanent, separate filter chips. Tags are lower-cased on the way in; these two are not. (Filtering moved to the client with #5, but the matching rule is unchanged — it is still exact.) | `lib/filters/apply.ts:33` |
| ~~21~~ | ~~3.2~~ | **FIXED.** Wall order no longer uses hue at all. It sorts on `warmth` — the average colour projected onto one cool↔warm axis in OKLab — which stays meaningful on the complementary-colour frames where a dominant hue is the winner of a very close election. `isMonochrome` is measured separately from per-pixel RMS chroma, before any cancellation. | `lib/color/analyze.ts`, `lib/color/sort.ts` |
| ~~22~~ | ~~4.1~~ | **FIXED** alongside #5. The stills query now orders by `createdAt desc`, so `sortPhotosForWall` — which is stable — has a deterministic input and photos that tie on hue keep their relative order between renders. | `app/(site)/stills/page.tsx` |
| 23 | 4.3 | The lightbox declares `role="dialog"` and `aria-modal` but never moves focus into itself, traps nothing, and restores nothing — Tab walks the wall behind the overlay while the visitor sees only the photo. | `components/stills/Lightbox.tsx:300` |
| 24 | 3.4 | **Half fixed.** `capturedAt` now has a column — `Photo.takenAt`, prefilled from EXIF at upload — so capture date is no longer lost. `coordinates` is still parsed and never consumed, and remains the obvious prefill for `location`, a required field typed by hand on every upload. | `lib/photo/exif.ts:96` |
| 25 | N6 | **Every dynamic page runs its query twice, because `generateMetadata` and the page body each load independently and neither is wrapped in React's `cache()`.** On the journal that is two `findUnique` calls per render. On a clip page it is worse: `loadClip` reads the *entire* video table — it has to, since a clip's frame code and pager are positions in an ordering — so every render is two full table scans, and `generateStaticParams` multiplies that across every clip at build time, making the build O(clips²). One `cache()` import around both loaders halves it; a `sortOrder`-window query would fix the scan itself. | `app/(site)/motion/[id]/page.tsx:28`, `app/(site)/journal/[slug]/page.tsx:31` |
| 26 | 3.6 | Every keystroke in a trim input re-runs `prepareUpload`: a full-resolution crop plus a WebP encode of a 2560px image, on the main thread, undebounced. A three-digit inset queues three full encodes. | `components/admin/PhotoForm.tsx:138` |
| 27 | 2.4 | `postJson` discards the JSON `error` body the upload routes carefully return, so a mid-upload session expiry — the single most likely failure on a long upload — surfaces as "failed with status 401". | `lib/storage/upload-client.ts:43` |
| 28 | 2.3 | Part size is pinned at the 5 MiB minimum with one `POST /api/upload/part-url` per part, so a 1 GB video costs 200 sequential serverless round-trips. Scale part size with file size and sign all part URLs in the `create` response. | `lib/storage/upload-client.ts:70` |
| ~~29~~ | ~~3.3~~ | **SUPERSEDED** by the `warmth` rework. `isMonochrome` now thresholds RMS per-pixel chroma rather than a mean, which is what stops a mostly-grey frame with one vivid subject being filed as black-and-white. A percentile would still be more robust than an RMS; reopen if it misfiles anything in practice. | `lib/color/analyze.ts:153` |
| 30 | 4.4 | Frames below the fold get `data-pending` and depend on an IntersectionObserver to clear it. Any path where the observer never fires leaves a frame permanently invisible; there is no timeout or fallback. | `components/stills/PolaroidWall.tsx:202` |
| 31 | 2.7 | Media cannot be replaced, only deleted and re-created — losing the row's id, tags and `createdAt`. `deleteObjectsByUrl` is retry-safe, so upload-new → save → delete-old is achievable. Product decision worth revisiting. | `components/admin/UploadField.tsx:24` |
| 32 | 1.6 | No `try`/`catch` around `fetch` in the login submit: a network failure leaves the button stuck on "Signing in…" with no error. The 5xx path is handled carefully; the transport path is not. | `components/site/LoginForm.tsx:17` |
| 33 | 6.2 | No progress signal during the 18 sprite seeks, so a long clip looks like a frozen form. | `lib/video/sprite.ts:150` |
| 34 | 2.5 | Upload progress counts parts, not bytes: any file under 5 MiB jumps 0 → 100, and a short final part counts as a whole one. | `lib/storage/upload-client.ts:92` |

## Tier 3 — Polish, robustness, and tests

Nothing here is currently biting. Worth fixing when the file is open anyway.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| 35 | 1.8 | **Partly fixed.** Expired-token and foreign-issuer cases added, and `safeNextPath` is now exported and covered. Still missing: any coverage of `verifyPassword`. | `tests/unit/auth/session.test.ts` |
| 36 | N1 | `/admin/photos` renders the whole library as 64×48 thumbnails from `photo.imageUrl` — the full-resolution stored WebP each time, one plain `<img>` per row. The comment defends skipping `next/image`, and it is right to: an optimisation request per thumbnail is exactly what the Hobby-tier transformation limit cannot afford. But that argument only covers the transformation cost, not the megabytes, and this page grows without bound as the library does. R2 egress is free, so this is page weight and decode time rather than a bill — hence Tier 3 rather than Tier 0. A stored thumbnail key, or Cloudflare Image Resizing on the R2 host, settles both sides. | `app/admin/photos/page.tsx:36` |
| 37 | N8 | `listPostMedia` returns every photo row and every video row, unpaginated, each time the editor's media picker is opened. Deferring it off the page load is the right call and is documented; the query behind it still has no ceiling. | `app/admin/posts/actions.ts:99` |
| 38 | 2.6 | `createObjectURL` inside `useMemo` — React may discard and recompute a memo, allocating a second object URL the revoke effect never cleans. `useState` + `useEffect` keyed on `file` is the sound version. Note the same pattern is now in `VideoForm` twice (`:90`, `:102`), and one of those holds the entire clip. | `components/admin/UploadField.tsx:49`, `components/admin/VideoForm.tsx:90` |
| 39 | 7.1 | `uniqueSlug` loops one `findUnique` per candidate, unbounded. A single `findMany` on the `base%` prefix settles it in one query. | `app/admin/posts/actions.ts:24` |
| 40 | 7.2 | The journal list loads `markdownContent` for every post just to compute an excerpt — and in fact selects every column, since the query passes no `select` at all. | `app/(site)/journal/page.tsx:9` |
| 41 | N7 | `filtersFromSearchParams` is dead. Nothing imports it but its own test, and its doc comment describes a server-side arrangement — "both the Stills and Motion pages need the same normalisation" — that #5 removed when filtering moved to the client. `CLAUDE.md` still points at `lib/filters/where.ts` for the same reason, and that file no longer exists either. Dead code with a confident comment is worse than dead code. | `lib/filters/parse.ts:51` |
| 42 | 3.5 | `detectBorder` scales all four insets by the *width* ratio; vertical insets should use the height ratio. `targetSize` rounds each axis independently, so they differ by up to a pixel. | `lib/photo/trim-client.ts:79` |
| 43 | 3.7 | `maxInsetRatio` is enforced per side, so top and bottom can each take 35% and consume 70% of the height between them. `cropRect` prevents collapse but not an absurd crop. | `lib/photo/border.ts:110` |
| 44 | 3.8 | `analyzePixels` skips only fully transparent pixels; partially transparent ones are counted uncomposited, biasing the average dark. PNG uploads only. | `lib/color/analyze.ts:123` |
| 45 | N9 | `findAudioFormats` pushes the sample-entry fourcc *before* checking that the entry's size is sane, so a truncated or corrupt `stsd` contributes a garbage four-character string to the format list. `describeAudioProblem` then reports it verbatim — "This clip's audio is “\0\0\v”" — a warning about a codec that is not there, on a file the module is otherwise careful to stay silent about. Move the `size < 8` check above the push. | `lib/video/audio.ts:142` |
| 46 | N11 | `splitIntoParts` returns `[]` for a zero-byte blob, so `uploadFile` sends `parts: []` and the completion route's `.min(1)` rejects it as "Invalid completion request" — the one message in the upload path that says nothing about what went wrong. Reachable if a canvas encode ever yields an empty blob. Refuse an empty file at the top of `uploadFile` with a message that names the cause. | `lib/storage/upload-client.ts:22` |
| 47 | N10 | `client()` reads `cached` three lines before `let cached` is declared. Legal only because nothing calls `client()` during module evaluation — the lazy `db` Proxy is precisely what guarantees that, so the two are load-bearing on each other by accident rather than by design. Moving the declaration above its use costs nothing and removes the coupling. | `lib/db.ts:22` |
| 48 | 2.8 | `DeleteObjectsCommand` caps at 1000 keys per call — only a trap for a future bulk delete. | `lib/storage/r2.ts:100` |

---

## Appendix — what each feature does well

Recorded so a later pass does not "fix" something that is deliberate.

**1. Auth & session** (`src/proxy.ts`, `lib/auth/*`, `api/auth/*`, login) — the
two-layer gate has no gaps: the proxy covers `/admin/*` pages and every server
action and route handler re-checks independently. bcrypt is confined to the
Node-pinned login route. Upload keys are minted server-side.

**2. Upload pipeline** (`lib/storage/*`, `api/upload/*`, `UploadField`) — keys are
minted server-side so a client cannot choose its write location or clobber an
existing object; `completeMultipart` re-sorts parts rather than trusting client
ordering; `objectKeyFromUrl` refuses keys outside our bucket; uploads happen on
save, never on pick. `splitIntoParts` is correct on every boundary case.

**3. Photo processing** (`lib/photo/*`, `lib/color/analyze.ts`, photo admin
components) — `detectBorderInsets` measures each side independently and bails
early per line; `cropRect` clamps so a crop cannot collapse; `scaleInsets` floors
so it errs towards leaving a hair of frame. Re-cropping always works from the
decoded original, so nudging an inset does not compound WebP loss. EXIF is read
before the canvas round-trip, and prefill never overwrites a typed value.

**4. Stills wall** (`app/(site)/stills`, `lib/color/sort.ts`,
`lib/photo/justify.ts`, `components/stills/*`) — FLIP re-flow and entry stagger
both honour `prefers-reduced-motion`, and the reveal observer is skipped entirely
under it (hiding content until scrolled to is itself motion — the right call).
Placement is keyed by id so it survives a filter change.

**5. Filters** (`lib/filters/*`, `FilterBar`) — OR-within/AND-across is
implemented exactly as documented; facets come from values actually present; the
options query deliberately ignores active filters so chips do not vanish under
the cursor; tag facets exclude video-only tags.

**6. Motion** (`lib/video/*`, `app/(site)/motion`, `components/motion/*`) — seeks
are sequential for a documented reason (one playhead per `<video>`); the object
URL and decoder are released in a `finally`; canvas width is reasoned against the
browser limit; the sampling-window rationale is well argued and correctly clamped
for short clips.

**7. Journal** (`app/(site)/journal/**`, `lib/excerpt.ts`, `lib/slug.ts`,
`lib/post/date.ts`, posts actions) — drafts are excluded in the query rather than
filtered client-side, and a draft slug 404s. `react-markdown` runs without
`rehype-raw`, so embedded HTML is not rendered. Locale *and* time zone are pinned
on `formatPostDate`. Published slugs are frozen against retitling while draft
slugs still track the title; `publishedAt` is stamped at publish time.

**8. Admin CRUD** (`app/admin/*/actions.ts`, `lib/tags/*`, `AdminBar`) — every
action re-checks auth; `reorderVideos` takes the whole ordering in one
transaction rather than a moved pair; the opposite delete/update orderings in
`deletePhoto` and `retouchPhoto` are each individually correct and each explain
why they differ.

Added by the 2026-08-06 pass, for the surfaces that did not exist above:

**9. Journal media and Markdown** (`lib/markdown/*`, `PostMarkdown`,
`MediaPicker`) — `rehype-raw` is deliberately absent, so nothing pasted into a
body becomes markup, and media is instead ordinary Markdown given meaning at
render time. `youtubeId` checks the *host* rather than pattern-matching, so an
arbitrary link can never become an iframe pointed somewhere else, and the id is
held to the 11-character alphabet. `isOptimisableUrl` is load-bearing rather than
an optimisation: `next/image` throws on an unlisted host and a throw during
render takes the page, so anything off our own bucket falls back to a plain
`<img>` on purpose. Caption and URL escaping in `mediaSnippet` treat both as
hostile, which they are — one is typed and the other comes off another row.

**10. Static rendering and the client-side wall** (`useIsAdmin`,
`useAssetsReady`, `StillsGallery`) — the admin check moved to a client hook
specifically so a cookie read in the layout could not opt every public page out
of static rendering; `/api/auth/state` returns a bare boolean because it is
reachable without a session and so must not describe one. `useAssetsReady` gates
on real load events with both a grace floor and a hard cap, so the loader can
neither flicker on a warm cache nor be held hostage by a dead CDN. Facets are
derived from the whole library rather than the visible subset, so a chip cannot
vanish under the cursor that clicked it.

**11. Container parsing** (`lib/video/audio.ts`, `lib/video/mp4.ts`) — both read
box headers only and never decode a frame, which is what keeps them inside the
"no server-side video processing" rule; `readMoov` skips `mdat` by arithmetic
rather than loading it, so inspecting a 500 MB clip costs kilobytes. `inspectAudio`
returns null on anything it cannot parse, because a false warning on every upload
would train the admin to ignore the true ones. `mp4.ts` says in its own header
that it exists for one backfill script and must not become a general parser —
believe it.

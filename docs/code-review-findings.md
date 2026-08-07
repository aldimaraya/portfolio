# Code review findings

Fresh-eyes review of the whole codebase, ordered by how much the bug actually
costs you: exposure and money first, then data loss, then correctness, then
polish. Original per-feature IDs are kept in the `#` column so they can be traced
back; the feature-by-feature notes are in the appendix.

Delete a finding when it is fixed, or mark it `WONTFIX` with a reason.

Reviewed against the code on 2026-08-04; the pre-deploy pass on 2026-08-05 closed
1.1 and 8.2. Findings that describe code which no
longer exists have been struck through and annotated rather than deleted, so the
reasoning stays traceable. The open ones here are the same list summarised under
[Known gaps](architecture.md#known-gaps).

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
| ~~12~~ | ~~8.3~~ | **FIXED.** Every media delete now writes the row first and cleans up R2 after, best-effort. Neither order is atomic, so the choice is only which half-done state to accept, and an object nothing points at is strictly cheaper than a public page serving a 404 — it is invisible, costs pennies, and the failing URLs are logged so it can be swept by hand. `deleteVideo` carried the same ordering (its comment cited `deletePhoto`), and so did `saveVideo`'s cleanup of a replaced poster/sprite, which could strand a row pointing at a poster it had just deleted. All three now match `retouchPhoto`, which already reasoned this way. | `app/admin/photos/actions.ts`, `app/admin/videos/actions.ts` |
| 13 | 6.1 | `once()` never times out, so a video the browser accepts but cannot seek hangs `generateSpriteSheet` forever with the form stuck busy and no error. The admin's only recovery is a reload, losing the filled-in form. | `lib/video/sprite.ts:34` |
| ~~14~~ | ~~8.4~~ | **FIXED.** `tagConnections` upserts sequentially. Two tags of one name cannot collide inside a single call — `parseTagNames` dedupes — but two saves overlapping in flight can, and one admin still has two tabs. A handful of names per save makes the extra round-trips unmeasurable. | `lib/tags/index.ts` |

## Tier 2 — Correctness and user-facing behaviour

Wrong output, wrong order, or a dead end for the person using it.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| 15 | 5.1 | Camera and location are matched exactly against free text that is never normalised on write, so "Leica M6" and "leica m6 " become two permanent, separate filter chips. Tags are lower-cased on the way in; these two are not. (Filtering moved to the client with #5, but the matching rule is unchanged — it is still exact.) | `lib/filters/apply.ts:33` |
| ~~16~~ | ~~3.2~~ | **FIXED.** Wall order no longer uses hue at all. It sorts on `warmth` — the average colour projected onto one cool↔warm axis in OKLab — which stays meaningful on the complementary-colour frames where a dominant hue is the winner of a very close election. `isMonochrome` is measured separately from per-pixel RMS chroma, before any cancellation. | `lib/color/analyze.ts`, `lib/color/sort.ts` |
| ~~17~~ | ~~4.1~~ | **FIXED** alongside #5. The stills query now orders by `createdAt desc`, so `sortPhotosForWall` — which is stable — has a deterministic input and photos that tie on hue keep their relative order between renders. | `app/(site)/stills/page.tsx` |
| 18 | 4.3 | The lightbox declares `role="dialog"` and `aria-modal` but never moves focus into itself, traps nothing, and restores nothing — Tab walks the wall behind the overlay while the visitor sees only the photo. | `components/stills/Lightbox.tsx:225` |
| 19 | 3.4 | **Half fixed.** `capturedAt` now has a column — `Photo.takenAt`, prefilled from EXIF at upload — so capture date is no longer lost. `coordinates` is still parsed and never consumed, and remains the obvious prefill for `location`, a required field typed by hand on every upload. | `lib/photo/exif.ts:96` |
| 20 | 3.6 | Every keystroke in a trim input re-runs `prepareUpload`: a full-resolution crop plus a WebP encode of a 2560px image, on the main thread, undebounced. A three-digit inset queues three full encodes. | `components/admin/PhotoForm.tsx:120` |
| 21 | 2.4 | `postJson` discards the JSON `error` body the upload routes carefully return, so a mid-upload session expiry — the single most likely failure on a long upload — surfaces as "failed with status 401". | `lib/storage/upload-client.ts:38` |
| 22 | 2.3 | Part size is pinned at the 5 MiB minimum with one `POST /api/upload/part-url` per part, so a 1 GB video costs 200 sequential serverless round-trips. Scale part size with file size and sign all part URLs in the `create` response. | `lib/storage/upload-client.ts:74` |
| ~~23~~ | ~~3.3~~ | **SUPERSEDED** by the `warmth` rework. `isMonochrome` now thresholds RMS per-pixel chroma rather than a mean, which is what stops a mostly-grey frame with one vivid subject being filed as black-and-white. A percentile would still be more robust than an RMS; reopen if it misfiles anything in practice. | `lib/color/analyze.ts:153` |
| 24 | 4.4 | Frames below the fold get `data-pending` and depend on an IntersectionObserver to clear it. Any path where the observer never fires leaves a frame permanently invisible; there is no timeout or fallback. | `components/stills/PolaroidWall.tsx:160` |
| 25 | 2.7 | Media cannot be replaced, only deleted and re-created — losing the row's id, tags and `createdAt`. `deleteObjectsByUrl` is retry-safe, so upload-new → save → delete-old is achievable. Product decision worth revisiting. | `components/admin/UploadField.tsx:24` |
| 26 | 1.6 | No `try`/`catch` around `fetch` in the login submit: a network failure leaves the button stuck on "Signing in…" with no error. The 5xx path is handled carefully; the transport path is not. | `components/site/LoginForm.tsx:17` |
| 27 | 6.2 | No progress signal during the 18 sprite seeks, so a long clip looks like a frozen form. | `lib/video/sprite.ts:72` |
| 28 | 2.5 | Upload progress counts parts, not bytes: any file under 5 MiB jumps 0 → 100, and a short final part counts as a whole one. | `lib/storage/upload-client.ts:97` |

## Tier 3 — Polish, robustness, and tests

Nothing here is currently biting. Worth fixing when the file is open anyway.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| 29 | 1.8 | **Partly fixed.** Expired-token and foreign-issuer cases added, and `safeNextPath` is now exported and covered. Still missing: any coverage of `verifyPassword`. | `tests/unit/auth/session.test.ts` |
| 30 | 2.6 | `createObjectURL` inside `useMemo` — React may discard and recompute a memo, allocating a second object URL the revoke effect never cleans. `useState` + `useEffect` keyed on `file` is the sound version. | `components/admin/UploadField.tsx:49` |
| 31 | 7.1 | `uniqueSlug` loops one `findUnique` per candidate, unbounded. A single `findMany` on the `base%` prefix settles it in one query. | `app/admin/posts/actions.ts:28` |
| 32 | 7.2 | The journal list loads `markdownContent` for every post just to compute an excerpt. | `app/(site)/journal/page.tsx:10` |
| 33 | 3.5 | `detectBorder` scales all four insets by the *width* ratio; vertical insets should use the height ratio. `targetSize` rounds each axis independently, so they differ by up to a pixel. | `lib/photo/trim-client.ts:79` |
| 34 | 3.7 | `maxInsetRatio` is enforced per side, so top and bottom can each take 35% and consume 70% of the height between them. `cropRect` prevents collapse but not an absurd crop. | `lib/photo/border.ts:110` |
| 35 | 3.8 | `analyzePixels` skips only fully transparent pixels; partially transparent ones are counted uncomposited, biasing the average dark. PNG uploads only. | `lib/color/analyze.ts:53` |
| 36 | 2.8 | `DeleteObjectsCommand` caps at 1000 keys per call — only a trap for a future bulk delete. | `lib/storage/r2.ts:95` |

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

**8. Admin CRUD** (`app/admin/*/actions.ts`, `lib/tags.ts`, `AdminBar`) — every
action re-checks auth; `reorderVideos` takes the whole ordering in one
transaction rather than a moved pair. The delete/update orderings in
`deletePhoto` and `retouchPhoto` used to be opposite and each argued its own
case; #8.3 settled them on one rule — row first, R2 after, best-effort — since
only one of the two half-done states is visible to a visitor.

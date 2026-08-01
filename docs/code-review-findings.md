# Code review findings

Fresh-eyes review of the whole codebase, ordered by how much the bug actually
costs you: exposure and money first, then data loss, then correctness, then
polish. Original per-feature IDs are kept in the `#` column so they can be traced
back; the feature-by-feature notes are in the appendix.

Delete a finding when it is fixed, or mark it `WONTFIX` with a reason.

---

## Tier 0 — Privacy, security, and money

Things that leak data, let someone in, or bill you while you sleep.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| ~~1~~ | ~~3.1~~ | **FIXED.** Photo GPS and camera serials were published to a public bucket whenever the WebP re-encode came out no smaller, because only the re-encode path strips EXIF. `keepsOriginal` now refuses to keep any file carrying metadata, so the size optimisation still applies to stripped web exports — the case it was aimed at — and nothing with location data in it is uploaded verbatim. `prepareUpload` defaults the flag to "has metadata" so an uninformed caller gets the safe answer. Covered by a test. | `lib/photo/trim-client.ts` |
| ~~2~~ | ~~2.2~~ | **FIXED.** `uploadFile` now aborts the multipart upload on any failure via a new `POST /api/upload/abort`, best-effort so the abort never masks the real error. The closed-tab case the browser cannot report is covered by the `AbortIncompleteMultipartUpload` lifecycle rule, now documented as required bucket setup in the README alongside the CORS `ExposeHeaders` requirement. | `lib/storage/upload-client.ts`, `app/api/upload/abort/route.ts` |
| 3 | 1.1 | **No rate limiting or lockout on login.** One static password, unlimited attempts. bcrypt(12) throttles a serial attacker but not concurrent ones, and each attempt burns a full-CPU serverless invocation — so it is a credential risk and a billing amplifier at the same time. **Needs a decision:** in-memory counter (free, per-instance, resets on cold start) vs. Upstash/Vercel KV (durable, another dependency). | `app/api/auth/login/route.ts:14` |
| ~~4~~ | ~~1.2~~ | **FIXED.** The signing key is now derived with HKDF-SHA256 from `SESSION_SECRET` (key material) and `ADMIN_PASSWORD_HASH` (salt), so changing the password regenerates the bcrypt salt, changes the key, and invalidates every token issued under the old password. Derivation is cached per process, since neither input can change without a restart. Two tests cover it: a token issued under the previous password is rejected, and new tokens still work. | `lib/auth/session.ts` |
| 5 | 8.1 + 4.2 | **Every page view costs a full database round-trip that nothing needs.** Every action calls `revalidatePath`, and every public page sets `force-dynamic` — so the invalidation calls do nothing and the cache they exist to manage is never used. Compounding it, `/stills` fetches every photo with all columns plus a second full-table scan for facets, with no `take`. **Needs a decision:** this is an architecture change — dropping `force-dynamic` makes the existing `revalidatePath` calls load-bearing, and the `AdminBar` cookie read in the public layout has to move behind a boundary first. | `app/(site)/*/page.tsx`, `app/(site)/stills/page.tsx:22` |
| ~~6~~ | ~~1.5~~ | **FIXED.** `safeNext` was prefix-matching, which let `/\evil.example` through. Replaced by `safeNextPath` in `lib/auth/next-path.ts` — resolves against a placeholder origin and requires the result to have stayed there, which covers absolute URLs, protocol-relative hosts, backslash smuggling and `javascript:` in one rule. Moved out of the page file so it is testable; eight cases pinned (closes the `safeNext` half of 1.8). | `lib/auth/next-path.ts` |
| ~~7~~ | ~~1.3~~ | **FIXED.** `jwtVerify` now pins `algorithms: ['HS256']` explicitly rather than relying on jose's key-type inference. | `lib/auth/session.ts` |
| ~~8~~ | ~~1.4~~ | **FIXED.** Tokens now carry and verify an issuer (`portfolio`) and audience (`portfolio-admin`). Note: this invalidates existing sessions — everyone signs in again once on deploy. Covered by a test that a correctly signed token issued for something else is rejected. | `lib/auth/session.ts` |
| ~~9~~ | ~~1.7~~ | **FIXED.** Logout compares `Origin` against the request's own host. A missing `Origin` is allowed — same-origin form posts omit it, and a forced sign-out is the entire stake. | `app/api/auth/logout/route.ts` |

## Tier 1 — Data loss and integrity

Things that destroy or corrupt content that cannot be recovered from the UI.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| 10 | 8.2 | **A failed update silently strips every tag from a photo.** `photoTag.deleteMany` then `photo.update`, unwrapped: if the update fails, the delete has already committed. Same shape in `saveVideo`. Wrap both in `db.$transaction`. | `app/admin/photos/actions.ts:44` |
| 11 | 2.1 | **One failed part discards the entire upload** — the exact failure multipart was adopted to prevent. The module header promises parts "can be retried"; nothing retries them. All of the complexity, none of the payoff. A bounded retry with backoff around the PUT is ~15 lines. | `lib/storage/upload-client.ts:70` |
| 12 | 8.3 | `deletePhoto` removes the R2 object before the row. The stated reasoning is sound, but the accepted failure — row delete fails after the object is gone — leaves a live row pointing at a 404 on the public wall. Only one of the two risks is named in the comment. | `app/admin/photos/actions.ts:118` |
| 13 | 6.1 | `once()` never times out, so a video the browser accepts but cannot seek hangs `generateSpriteSheet` forever with the form stuck busy and no error. The admin's only recovery is a reload, losing the filled-in form. | `lib/video/sprite.ts:34` |
| 14 | 8.4 | `tagConnections` fires concurrent upserts via `Promise.all` — a classic unique-violation race in Postgres. Will not bite with one admin; sequential is free. | `lib/tags.ts:19` |

## Tier 2 — Correctness and user-facing behaviour

Wrong output, wrong order, or a dead end for the person using it.

| Rank | # | Finding | File |
| --- | --- | --- | --- |
| 15 | 5.1 | Camera and location are matched with exact `in` against free text that is never normalised on write, so "Leica M6" and "leica m6 " become two permanent, separate filter chips. Tags are lower-cased on the way in; these two are not. | `lib/filters/where.ts:11` |
| 16 | 3.2 | Wall order uses the hue of the *averaged* RGB. For complementary-colour photos that average is near-grey, where hue is numerical noise — and per-pixel saturation keeps them out of the monochrome band, so they sort to an arbitrary spot. `analyzePixels` already contains this exact insight for `isMonochrome`; the ordering hue walks into the trap the comment warns about. | `lib/color/analyze.ts:68` |
| 17 | 4.1 | `db.photo.findMany` has no `orderBy`, so row order is whatever Postgres returns and shifts after any update. `sortPhotosForWall` is stable, so ties inherit that arbitrary order and the wall reshuffles for no visible reason. Add a deterministic tiebreak. | `app/(site)/stills/page.tsx:22` |
| 18 | 4.3 | The lightbox declares `role="dialog"` and `aria-modal` but never moves focus into itself, traps nothing, and restores nothing — Tab walks the wall behind the overlay while the visitor sees only the photo. | `components/stills/Lightbox.tsx:225` |
| 19 | 3.4 | `capturedAt` and `coordinates` are parsed and never consumed. `coordinates` is the obvious prefill for `location` — a required field typed by hand on every upload — and `capturedAt` has no column, so everything orders by upload time rather than capture time. | `lib/photo/exif.ts:96` |
| 20 | 3.6 | Every keystroke in a trim input re-runs `prepareUpload`: a full-resolution crop plus a WebP encode of a 2560px image, on the main thread, undebounced. A three-digit inset queues three full encodes. | `components/admin/PhotoForm.tsx:120` |
| 21 | 2.4 | `postJson` discards the JSON `error` body the upload routes carefully return, so a mid-upload session expiry — the single most likely failure on a long upload — surfaces as "failed with status 401". | `lib/storage/upload-client.ts:38` |
| 22 | 2.3 | Part size is pinned at the 5 MiB minimum with one `POST /api/upload/part-url` per part, so a 1 GB video costs 200 sequential serverless round-trips. Scale part size with file size and sign all part URLs in the `create` response. | `lib/storage/upload-client.ts:74` |
| 23 | 3.3 | `isMonochrome` thresholds the *mean* per-pixel saturation, so a mostly-grey frame with one vivid subject is filed as black-and-white. A high percentile is more robust than a mean. | `lib/color/analyze.ts:73` |
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
transaction rather than a moved pair; the opposite delete/update orderings in
`deletePhoto` and `retouchPhoto` are each individually correct and each explain
why they differ.

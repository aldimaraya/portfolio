# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # dev server (Turbopack), http://localhost:3000
npm run build            # production build
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm test                 # vitest unit tests (tests/unit/**)
npm run test:watch
npm run test:e2e         # playwright (tests/e2e); needs `npx playwright install` once
npm run db:push          # push prisma/schema.prisma to Neon
npm run db:generate      # regenerate Prisma client (also runs postinstall)
npm run db:studio
npm run check:r2         # scripts/check-r2.mjs — verify R2 credentials/bucket
npm run backfill:photos  # re-compress + backfill stored photos
npm run backfill:settings
npm run recolor:photos   # scripts/recolor-photos.mjs — re-derive OKLab colour stats
```

Single test: `npx vitest run tests/unit/photo/border.test.ts`, or `-t "name"` to filter by test name.
Single E2E: `npx playwright test tests/e2e/<file> -g "name"`.

Node 20.9+ required (`.nvmrc`). `npm run test:e2e` reuses an already-running dev server locally, so its
environment is whatever that server was started with.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript · Tailwind v4 (theme tokens live in an `@theme` block in
`src/app/globals.css`; there is no `tailwind.config.ts`) · Prisma 7 on Neon Postgres · Cloudflare R2 for
media · `bcryptjs` + `jose` for the single-admin session · Zod 4 · Vitest + Playwright · Vercel.

## Architecture

Three public surfaces under `src/app/(site)`: **stills** (colour-sorted photo wall), **motion** (a list of
clips, each with its own page at `/motion/[id]`), **journal** (Markdown blog). One password-protected `src/app/admin` area manages all of it.
Shared domain logic lives in `src/lib/<concern>/`, and every pure module there has a mirrored suite in
`tests/unit/<concern>/`.

Load-bearing constraints — these are why the code is shaped this way:

- **Derived data is computed once, in the browser, at upload time.** Average colour (`lib/color/analyze.ts`),
  border insets (`lib/photo/border.ts`), compression (`lib/photo/compress.ts` + `trim-client.ts`), and video
  sprite sheets (`lib/video/sprite.ts`) all run client-side and are stored on the row. There is no
  server-side image or video processing. Rendering a public page is a plain database read.
- **Media never passes through the app server.** Browser → R2 over presigned *multipart* URLs
  (`lib/storage/multipart.ts`, `app/api/upload/*`), so a 1 GB upload failing at 90% does not restart. Video
  is served straight from R2/CDN; only photos take the `next/image` hop. The exceptions are the two
  admin-only same-origin reads sharing `lib/storage/media-source.ts` — `app/api/admin/photo-source`, so
  the border trimmer can get untainted canvas pixels, and `app/api/admin/video-source`, so a stored clip's
  scrub preview can be regenerated. Both are session-gated and restricted to keys inside our own bucket.
- **Wall order is fully derived from colour, in OKLab.** Photos have no manual sort column:
  `lib/color/sort.ts` produces a monochrome band dark→light followed by a cool→warm sweep, and
  `lib/photo/justify.ts` packs that order into justified rows. It sorts on `warmth` — the average colour
  projected onto one cool↔warm axis — **not** on hue: measured across this library, half to two-thirds of
  a typical frame's colour cancels out (sky against land), so a dominant hue is the winner of a very close
  election and orders the wall by noise. Warmth stays meaningful when nothing dominates. `isMonochrome` is
  deliberately measured differently, from per-pixel RMS chroma before any cancellation, so a red car
  against a cyan sky is not filed as black-and-white. Videos, by contrast, do have a manual `sortOrder`.
- **A photo's EXIF never reaches the stored copy, on purpose.** `prepareUpload` (`lib/photo/trim-client.ts`)
  always re-encodes a file that carries EXIF through a canvas before it reaches R2, so a photo's GPS
  coordinates are never published — see `keepsOriginal`. That means `Photo.takenAt` (`lib/photo/date.ts`),
  prefilled from `DateTimeOriginal` at upload, cannot be recovered later from anything already stored: once a
  photo is uploaded without it, the date is gone for good and has to be typed in by hand.
- **Filters are OR within a type, AND across types**, and live in the URL query string
  (`lib/filters/parse.ts` ↔ `where.ts`) so filtered views are shareable.
- **`prefers-reduced-motion: reduce` disables sprite animation entirely**, not just softens it.
- **The motion page's projector reports scrolling; it never drives it.** The roll used to be a sticky
  viewport with a `translateY` mapped off `window.scrollY`, which is what made it scroll strangely on a
  phone. What survives is decoration only: `MotionRoll` writes `--perforation-offset` and `--spool-turn`
  from that same `scrollY`, and deleting its effect changes nothing about how the page scrolls. Keep it
  that way — the perforation pitch and the spool's gearing are two readings of one number, so a change to
  `PERFORATION_PITCH` must stay in step with `.film-rail`'s `background-size`. The gate spool on a clip
  page is the exception that loops, and only while `data-playing` is true.
- **Video encoding is a manual pre-upload step** (local 1080p H.264, ~5–8 Mbps). 4K masters stay offline.

## Conventions that bite

- **Next 16:** the auth gate is `src/proxy.ts` exporting `proxy` — `middleware.ts`/`middleware` is
  deprecated and will not run. `cookies()`, `headers()`, `params`, and `searchParams` are all async.
- **Prisma 7:** `schema.prisma` carries no `url`; Migrate reads `prisma.config.ts` and the runtime client
  needs the Neon adapter. `lib/db.ts` exports `db` as a lazy Proxy so importing a module that mixes pure
  helpers with queries does not demand a live `DATABASE_URL` (unit tests rely on this) — never replace it
  with a top-level `new PrismaClient()`.
- **Auth is checked twice.** `proxy.ts` gates `/admin/*` pages, and every server action and route handler
  re-checks with `isAuthenticated()` / `requireSession()` (`lib/auth/guard.ts`), because server actions are
  publicly reachable endpoints regardless of which page rendered the form.
- **There is no development auth bypass, and there should not be one again.** `DEV_SKIP_AUTH` and
  `lib/auth/dev-bypass.ts` were removed before launch; `/admin` needs a real session in every
  environment. Local development therefore needs a working `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`
  — which is the right trade, because development points at the *live* Neon DB and R2 bucket.
- **Env is validated in slices** (`lib/env.ts`): `authEnv()` and `storageEnv()` are memoised and parsed
  lazily, so a half-configured environment only fails where it is actually missing something. Both are
  server-only — never import them from a client component.
- **Schema changes are not carried by a merge.** Production is `main`; work reaches it by PR from
  `feature/*`. There is no migration history — `db:push` is the only path — so merging promotes code, not
  schema. Push the schema to production *before* merging the code that needs it, and keep the change
  additive so the deployed code survives the gap. See *Release flow* in `docs/architecture.md`, which also
  covers preview deployments — they share production's data, and each has its own `next/image` cache, which
  is what puts the Hobby tier's transformation limit at risk.
- Comments here explain *why*, not what, and are dense. Match that register when editing.

## Docs

`docs/architecture.md` describes the site as built — surfaces, features, data model, invariants, ops, and
the known gaps — and is the document to trust when the others disagree with it. The design spec and the
task-by-task implementation plan in `docs/superpowers/{specs,plans}/` are history: every task is done, and
both are flagged as historical at the top. `docs/code-review-findings.md` tracks open defects, ranked by
cost, with fixed ones struck through rather than deleted — but **security findings never go in it**, or in
any other tracked doc: this repo is public, so an unfixed weakness written there is published next to the
source code for it. Raise those as a GitHub private security advisory, or fix them before writing them
down. Privacy and runaway-cost items may stay in Tier 0; anything that lets someone *in* does not.

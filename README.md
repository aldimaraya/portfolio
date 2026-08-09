# Portfolio

Personal photography and film site: a colour-sorted photo wall (**Stills**), a
roll of clips each with its own page (**Motion**), a Markdown blog
(**Journal**), and a password-protected admin area for managing all content
without touching code.

All four are **built and working** — there are no stubs left in the codebase.
What remains is listed under [Known gaps](docs/architecture.md#known-gaps); one
item is left there that blocks nothing unrecoverable.

- **Architecture and features, as built:** [docs/architecture.md](docs/architecture.md) — start here
- Original design spec: [docs/superpowers/specs/2026-07-28-personal-portfolio-design.md](docs/superpowers/specs/2026-07-28-personal-portfolio-design.md) (history)
- Implementation plan: [docs/superpowers/plans/2026-07-28-personal-portfolio.md](docs/superpowers/plans/2026-07-28-personal-portfolio.md) (history)
- Open defects: [docs/code-review-findings.md](docs/code-review-findings.md)
- Visual mockup: [docs/superpowers/specs/assets/2026-07-28-mockup-reference.html](docs/superpowers/specs/assets/2026-07-28-mockup-reference.html)

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (`@theme` block in `globals.css`, no `tailwind.config.ts`) |
| Database | Postgres (Neon) via Prisma 7 + `@prisma/adapter-neon` |
| Media storage | Cloudflare R2 (S3-compatible, zero egress) |
| Video encoding | `mediabunny` over WebCodecs, in the admin browser |
| Auth | Single admin: `bcryptjs` hash + `jose` session JWT, gated by `src/proxy.ts` |
| Validation | Zod 4 |
| Tests | Vitest (unit), Playwright (E2E) |
| Hosting | Vercel |

## Getting started

Node 20.9+ is required (developed against v24.18.0).

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

You need a [Neon](https://neon.tech) Postgres database for `DATABASE_URL` and a
Cloudflare R2 bucket with an API token for the `R2_*` values. The bucket needs
two pieces of configuration that no code in this repo can set for you:

- **`ExposeHeaders: ["ETag"]` in its CORS policy.** Multipart uploads cannot be
  completed without reading each part's ETag back, and the browser hides that
  header unless the bucket says otherwise.
- **An `AbortIncompleteMultipartUpload` lifecycle rule** (a day or two is
  plenty). `uploadFile` aborts an upload it sees fail, but a closed tab or a
  dead connection never reaches that code — and the parts already sent stay
  stored, billed, and absent from a normal object listing until something
  expires them.

Generate the two secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "your-admin-password"
```

Changing `ADMIN_PASSWORD_HASH` signs everyone out. The session signing key is
derived from the secret *and* the password hash, so a new password invalidates
every token issued under the old one — which means changing the password is a
complete response to a leaked one, with no second secret to remember to rotate.

Then push the schema and start the dev server:

```bash
npm run db:push
```

```bash
npm run dev
```

`/` redirects to `/stills`.

> `npm install` may report that install scripts were blocked for `prisma`,
> `@prisma/engines`, `unrs-resolver` and `sharp`. Prisma generates fine without
> them, but `sharp` powers `next/image` optimisation in production — run
> `npm approve-scripts sharp` if local image optimisation misbehaves.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack, the Next 16 default) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E (needs `npx playwright install` once) |
| `npm run db:push` | Push `prisma/schema.prisma` to the database |
| `npm run db:generate` | Regenerate the Prisma client (also runs on install) |
| `npm run db:studio` | Prisma Studio |
| `npm run check:r2` | Verify R2 credentials and bucket access |
| `npm run backfill:photos` | Re-compress and backfill stored photos |
| `npm run backfill:settings` | Populate `Photo.settings` on older rows |
| `npm run backfill:durations` | Recover `Video.durationSeconds` for clips predating the column |
| `npm run recolor:photos` | Re-derive OKLab colour stats |

The four backfills are dry runs by default; pass `-- --apply` to write.

## Architecture notes

These constraints are load-bearing — they are why the code is shaped this way.

- **Derived data is computed once, in the browser, at upload time.** Photo
  average colour and video preview sprite sheets are computed client-side and
  stored on the row, so rendering a public page is a cheap database read. There
  is no server-side image or video processing anywhere.
- **Media never passes through the app server.** Uploads go browser → R2 over
  presigned *multipart* URLs (a 1 GB upload that fails at 90% must not restart
  from zero). Video is served straight from R2/CDN; only photos take the
  `next/image` hop for resizing and lazy-loading.
- **Video is re-encoded in the browser, on save.** Clips over 1080p or ~6 Mbps
  are transcoded to H.264 via WebCodecs before they reach R2 — on the hardware
  encoder, with no ffmpeg and no server involved. The trigger is bitrate rather
  than file size, so a long clip that is merely large is left alone. Picking a
  clip only probes it; the encode waits for save, so changing your mind costs
  nothing. Desktop only — a phone would be killed for the memory it takes. 4K
  masters stay offline; the encode is lossy and one-way.
- **A photo's EXIF never reaches the stored copy.** Files carrying metadata are
  re-encoded through a canvas before upload, so GPS coordinates are never
  published — which also means a capture date missed at upload is gone for good.
- **Wall order is fully derived from colour**, in OKLab. Photos have no manual
  sort order: a monochrome band dark-to-light, then a cool→warm sweep, packed
  into justified rows in that order. It sorts on *warmth* rather than hue,
  because on a typical frame most colour cancels out and a dominant hue is the
  winner of a very close election.
- **The motion page's projector reports scrolling; it never drives it.** The
  perforations and the spool are read off `window.scrollY`, but deleting that
  effect changes nothing about how the page scrolls.
- **Filters combine as OR within a type, AND across types**, and live in the URL
  query string so filtered views are shareable.
- **`prefers-reduced-motion: reduce` means off, not gentler.** Sprite previews
  stop dead, the projector parks, and a clip does not autoplay.
- **Every public route is static or SSG**, so the `revalidatePath` calls in the
  admin actions are the only thing that updates a public page after an edit.
  `next build` therefore needs `DATABASE_URL`.
- **Next 16 specifics:** the auth gate is `src/proxy.ts` exporting `proxy`
  (`middleware.ts` is deprecated), and `cookies()`, `headers()`, `params` and
  `searchParams` are all async and must be awaited.
- **Prisma 7 specifics:** `schema.prisma` carries no `url` — the Migrate
  connection string lives in `prisma.config.ts`, and the runtime client requires
  the Neon driver adapter.

## What's built

| Surface | State |
| --- | --- |
| **Stills** | Colour-sorted justified wall, shareable URL filters (camera / location / tags), lightbox with swipe, keyboard nav and a FLIP expand, average-colour placeholders |
| **Motion** | The roll as a list on a perforated film rail, a page per clip at `/motion/[id]` with autoplay, running times, and prev/next along the roll |
| **Journal** | Markdown posts with drafts, a toolbar-and-media-picker editor, generated slugs, excerpts |
| **Admin** | Photo upload with EXIF extraction, compression, border trimming and tagging; video upload generating poster, sprite sheet, dimensions and duration; drag-to-reorder clips; post editing |
| **Platform** | Single-admin auth checked twice over, presigned multipart uploads direct to R2, every public route static or SSG, 357 unit tests and three Playwright specs |

For how any of it works and why, read
[docs/architecture.md](docs/architecture.md). For what is still wrong with it,
read [Known gaps](docs/architecture.md#known-gaps) and
[docs/code-review-findings.md](docs/code-review-findings.md).

> **Before launch:** the login has no rate limiting or lockout — one static
> password, unlimited attempts, each burning a full-CPU serverless invocation.
> With the development auth bypass now removed, that password is the whole of
> the defence, and development points at the *live* Neon database and R2 bucket.

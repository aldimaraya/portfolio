# Portfolio

Personal photography and film site: a colour-sorted photo wall (**Stills**), a
scrolling film-reel video viewer (**Motion**), a Markdown blog (**Journal**), and
a password-protected admin area for managing all content without touching code.

This repository is currently **scaffolding**. The stack is wired up, the schema
is defined, and every route exists, but the feature logic is stubbed. See
[what's built vs stubbed](#whats-built-vs-stubbed) below.

- Design spec: [docs/superpowers/specs/2026-07-28-personal-portfolio-design.md](docs/superpowers/specs/2026-07-28-personal-portfolio-design.md)
- Implementation plan: [docs/superpowers/plans/2026-07-28-personal-portfolio.md](docs/superpowers/plans/2026-07-28-personal-portfolio.md)
- Visual mockup: [docs/superpowers/specs/assets/2026-07-28-mockup-reference.html](docs/superpowers/specs/assets/2026-07-28-mockup-reference.html)

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (`@theme` block in `globals.css`, no `tailwind.config.ts`) |
| Database | Postgres (Neon) via Prisma 7 + `@prisma/adapter-neon` |
| Media storage | Cloudflare R2 (S3-compatible, zero egress) |
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
Cloudflare R2 bucket with an API token for the `R2_*` values. Generate the two
secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "your-admin-password"
```

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
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Prisma Studio |

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
- **Video encoding is a manual pre-upload step.** Clips are encoded locally to
  1080p H.264 at ~5–8 Mbps before upload. 4K masters stay offline.
- **Wall order is fully derived from colour.** Photos have no manual sort order: a
  monochrome band sorted dark-to-light, then a hue sweep, packed into justified
  rows in that order.
- **Filters combine as OR within a type, AND across types**, and live in the URL
  query string so filtered views are shareable.
- **`prefers-reduced-motion: reduce` disables sprite animation entirely.** Not
  optional — a page of looping previews is exactly what that setting exists to
  suppress.
- **Next 16 specifics:** the auth gate is `src/proxy.ts` exporting `proxy`
  (`middleware.ts` is deprecated), and `cookies()`, `headers()`, `params` and
  `searchParams` are all async and must be awaited.
- **Prisma 7 specifics:** `schema.prisma` carries no `url` — the Migrate
  connection string lives in `prisma.config.ts`, and the runtime client requires
  the Neon driver adapter.

## What's built vs stubbed

Working now:

- Next.js + Tailwind v4 + TypeScript build, lint, and typecheck
- Cinematic gold theme tokens translated from the mockup (`bg-ink`, `text-gold`,
  `bg-frame`, `border-hairline`, …)
- Prisma schema: `Photo`, `Video`, `BlogPost`, `Tag`, `PhotoTag`, `VideoTag`
- Validated env (`src/lib/env.ts`) and the Prisma client singleton (`src/lib/db.ts`)
- Site branding constants, header with active-tab underline, page shell
- Every route reachable, Vitest and Playwright harnesses green

Stubbed, with typed signatures and a pointer to the owning plan task:

| Area | Files | Plan task |
| --- | --- | --- |
| Colour analysis & wall order | `src/lib/color/*` | 3, 4, 11 |
| Sprite timestamps & generation | `src/lib/video/*` | 5, 12 |
| Filter parsing & queries | `src/lib/filters/*` | 6 |
| R2 keys & multipart upload | `src/lib/storage/*`, `src/app/api/upload/*` | 7, 8 |
| Auth | `src/lib/auth/*`, `src/proxy.ts`, `src/app/api/auth/*` | 9 |
| Tag upserts | `src/lib/tags.ts` | 11 |
| Admin screens | `src/app/admin/**` | 10–13 |
| Public pages | `src/app/stills`, `motion`, `journal` | 14–18 |

Every stub throws a message naming the plan task that implements it, so nothing
fails silently. The plan is written for task-by-task TDD — each task writes its
tests first.

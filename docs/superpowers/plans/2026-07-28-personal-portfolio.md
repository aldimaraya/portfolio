# Personal Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal photography/film portfolio site with a color-sorted photo wall, a scrolling film-strip video page with animated sprite previews, a Markdown blog, and a password-protected admin area for managing all content.

**Architecture:** A single Next.js App Router application. Public pages are server-rendered and read from Postgres via Prisma. Media lives in Cloudflare R2 and is uploaded directly from the browser via presigned multipart URLs, never through the app server. All expensive derived data (photo average color, video preview sprite sheets) is computed **client-side at upload time** and stored, so public page rendering is a cheap database read.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind CSS, Prisma 7 + Postgres (Neon) via the `@prisma/adapter-neon` driver adapter, Cloudflare R2 (`@aws-sdk/client-s3`), `jose` (session JWT), `bcryptjs` (password hash), `zod` (validation), Vitest (unit), Playwright (E2E).

**Source spec:** `docs/superpowers/specs/2026-07-28-personal-portfolio-design.md`

---

## Status and deviations (updated 2026-07-31)

**Done:** Tasks 1–19. **Next:** the deployment checklist at the end of this file.

Six of the admin e2e tests skip while `DEV_SKIP_AUTH=true` and
`ADMIN_PASSWORD_HASH` is still the placeholder — see the note under *Temporary*.

`Placeholder` is gone — Task 18 was its last caller, so the component was deleted
rather than left as dead code.

The code below in Tasks 11, 12, 15, 16 and 17 was written before the decisions
recorded here. Where it disagrees with this section, **this section is correct** —
the embedded snippets have deliberately not been rewritten, since they are a
record of the original plan rather than the current implementation.

### Schema

- **`Photo.filmStock` → `Photo.settings` (`Json`).** Film stock is the wrong frame
  for a digital shooter. Settings are now a structured blob — `lens`,
  `focalLength`, `aperture`, `shutter`, `iso` — prefilled from EXIF at upload.
  See `src/lib/photo/settings.ts`; read the column back through `toSettings()`,
  which coerces malformed JSON to blanks rather than throwing.
- **`Video.camera` / `format` / `fps` / `iso` dropped.** Capture settings carry
  real meaning for stills but not for these clips.
- **`Video.rollGroup` → `Video.description`** (optional). There are no rolls; the
  motion page is one flat wall. **This removes the per-roll grouping that Task 17
  was written around.**
- **`Video.sortOrder` is never typed in.** New clips are appended server-side as
  `max + 1`, and order is changed by dragging rows in the admin list, persisted by
  the `reorderVideos` action as a whole-list rewrite in one transaction.

### Behaviour established in the admin panel

Task 13 and anything else with an upload form should follow these; they exist
because each one was a real bug.

- **Uploads happen on save, not on file pick.** Picking only previews locally.
  Browsing away without saving used to orphan an object in R2.
- **Required-field checks run *before* the upload**, not just server-side, so an
  incomplete form cannot push a large file that the server then rejects. See
  `missingRequiredFields` in `src/lib/photo/form.ts` and `src/lib/video/form.ts`.
- **Create forms must reset themselves.** They render *on* the list page, so
  `router.push` to that same path does not unmount them and their state survives.
- **Client components holding server data need an explicit sync.** `useState`
  ignores its initial value on re-render, so a list initialised from props goes
  stale after `router.refresh()`. See `VideoList`.
- **Deleting a record deletes its R2 objects** (`deleteObjectsByUrl`), R2 first so
  a failure is retryable and leaves no orphan. Edit pages cannot replace a file,
  which closes the other orphan path.

### Filters

**There is no `buildVideoWhere`, and no video filter bar.** Filtering is
stills-only: videos carry neither a camera nor a location, so a video where-clause
had nothing to narrow. The motion page is one flat, drag-ordered list.

(This supersedes an earlier note here that `buildVideoWhere` matched on tags
alone. That function and its tests were removed in Task 15 rather than left as
dead code.)

### Temporary

`DEV_SKIP_AUTH` (`src/lib/auth/dev-bypass.ts`) skips the `/admin` login while the
panel is being built. It is inert unless `NODE_ENV` is development, so a deployed
instance cannot enable it. **Delete the file and its three call sites when the
admin panel is finished** — grep `DEV_SKIP_AUTH`.

### Operational notes

- A schema change needs the dev server **restarted**, not just `prisma generate` —
  `src/lib/db.ts` keeps a Prisma singleton in the dev process, and a stale one
  fails with `The column (not available) does not exist in the current database`.
- This project uses `prisma db push`; there is no migrations directory.

---

## Prerequisites (do this first — nothing else works without it)

- [x] **Node.js installed** — v24.18.0 with npm 11.16.0, at `C:\Program Files\nodejs`. Verified 2026-07-28.

**PATH caveat for agents and long-running shells:** Node was installed *after* this session's shells started, so a shell that inherited the older environment will fail with `node: command not found` even though Node is present. Prepend the right fix for your shell before any `npm`/`npx` command:

```bash
export PATH="$PATH:/c/Program Files/nodejs"
```

In PowerShell:

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
```

A genuinely new terminal opened after the install needs neither. Verify with `node --version` before starting Task 1.

Accounts needed before Task 2 and Task 7 respectively:
- A Neon Postgres database (free tier) — gives you a `DATABASE_URL`.
- A Cloudflare R2 bucket with an API token — gives you account ID, access key, secret, bucket name, and a public bucket URL.

---

## Global Constraints

- **Node.js 20.9+.** Installed: v24.18.0.
- **Next.js 16.2.12 / React 19.2.4 / Tailwind v4 / Vitest 4** are the installed versions. Next 16 has breaking changes from 15 that bind this project:
  - The auth gate file is `src/proxy.ts` exporting `proxy`, **not** `middleware.ts`/`middleware` (deprecated). Its runtime is Node and is not configurable.
  - Async Request APIs are strictly enforced — `cookies()`, `headers()`, and a page's `params`/`searchParams` **must** be awaited. Synchronous access was removed.
  - `next dev` uses Turbopack by default regardless of scaffold flags.
  - `next/image` `remotePatterns` is unchanged and is what this project uses; the v16 image changes affect only local images with query strings and the `minimumCacheTTL` default.
  - Next 16 bundles its own docs at `node_modules/next/dist/docs/` — consult those over recalled Next 15 conventions when something looks off.
- **Prisma 7.9.1** also breaks from v6 in two ways that bind this project:
  - `url` is **not** allowed in the `datasource` block of `schema.prisma`. The connection URL for Migrate lives in `prisma.config.ts` instead.
  - `new PrismaClient()` does **not** connect on its own. It requires a driver adapter: this project passes `new PrismaNeon({ connectionString })` from `@prisma/adapter-neon`.
- **Single admin user.** No roles, no multi-user accounts, no third-party auth provider.
- **No server-side video transcoding or adaptive-bitrate streaming.** Videos are compressed to a 1080p H.264 web encode (~5–8 Mbps) manually before upload.
- **No WYSIWYG blog editor.** Markdown textarea with live preview only.
- **No visitor-facing layout/palette switcher.** The site ships one layout (justified rows) and one palette (cinematic gold).
- **No search.** Filtering by camera/location/tag only.
- **Photos have no manual sort order.** Wall order is fully derived from color. Videos keep a manual `sortOrder` within their roll.
- **Filter combination logic:** OR within a single filter type, AND across different filter types.
- **`prefers-reduced-motion: reduce` disables sprite animation entirely** and shows static posters. Not optional.
- **Video is served directly from R2/CDN**, never proxied through the Next.js server. Photos go through `next/image` optimization (worth the server hop for automatic resizing, modern formats, and lazy loading; well within Vercel Hobby's image quota at this scale).
- **DRY is binding.** Shared logic lives in one module and is imported: tag upserts in `src/lib/tags.ts`, search-param parsing in `src/lib/filters/parse.ts`, shared form input classes in `src/components/admin/fields.ts`. Never paste an identical block into two files.

---

## File Structure

```
prisma/
  schema.prisma                     Photo, Video, BlogPost, Tag, join tables

src/
  proxy.ts                          Auth gate for /admin/* (Next 16 proxy convention)

  lib/
    db.ts                           Prisma client singleton
    env.ts                          Validated environment variables
    auth/
      password.ts                   bcrypt hash/verify (Node runtime only)
      session.ts                    jose JWT sign/verify (Edge-safe)
      guard.ts                      requireSession() server helper
    storage/
      r2.ts                         S3Client configured for R2 + key helpers
      multipart.ts                  Server-side multipart create/sign/complete
      upload-client.ts              Browser multipart uploader
    color/
      analyze.ts                    rgbToHsl, analyzePixels (pure)
      analyze-image.ts              Browser: File -> ColorStats via canvas
      sort.ts                       sortPhotosForWall (pure)
    video/
      timestamps.ts                 computeFrameTimestamps (pure)
      sprite.ts                     Browser: File -> sprite sheet via canvas
    filters/
      parse.ts                      URLSearchParams -> MediaFilters (pure)
      where.ts                      MediaFilters -> Prisma where (pure)

  components/
    site/Header.tsx                 Name, tagline, STILLS|MOTION|JOURNAL tabs
    site/FilterBar.tsx              Filter chips, writes to URL query
    stills/PolaroidWall.tsx         Flex justified-rows container
    stills/Polaroid.tsx             One photo card + caption
    motion/FilmStrip.tsx            Scroll-driven strip, tracks active frame
    motion/FilmFrame.tsx            One frame: sprite preview or video
    motion/SpritePreview.tsx        Stepped CSS sprite animation
    motion/VideoPlayer.tsx          Native <video> wrapper, themed
    motion/RollIndex.tsx            Sidebar index
    admin/UploadField.tsx           File picker + multipart upload progress
    admin/PhotoForm.tsx
    admin/VideoForm.tsx
    admin/PostForm.tsx
    admin/MarkdownEditor.tsx        Textarea + live preview pane

  app/
    layout.tsx, globals.css, page.tsx (redirect -> /stills)
    stills/page.tsx
    motion/page.tsx
    journal/page.tsx, journal/[slug]/page.tsx
    login/page.tsx
    admin/layout.tsx, admin/page.tsx
    admin/photos/page.tsx, admin/photos/[id]/page.tsx
    admin/videos/page.tsx, admin/videos/[id]/page.tsx
    admin/posts/page.tsx,  admin/posts/[id]/page.tsx
    api/auth/login/route.ts, api/auth/logout/route.ts
    api/upload/create/route.ts, api/upload/part-url/route.ts, api/upload/complete/route.ts

tests/
  unit/                             Vitest, mirrors src/lib
  e2e/                              Playwright smoke tests
```

**Interface summary** (defined in Tasks 3–8, consumed by Tasks 11–19):

```ts
// lib/color/analyze.ts
interface ColorStats { avgHue: number; avgSaturation: number; avgLightness: number; isMonochrome: boolean }
function rgbToHsl(r: number, g: number, b: number): [number, number, number]
function analyzePixels(pixels: Uint8ClampedArray, threshold?: number): ColorStats

// lib/color/analyze-image.ts (browser)
interface ImageAnalysis extends ColorStats { width: number; height: number }
function analyzeImageFile(file: File): Promise<ImageAnalysis>

// lib/color/sort.ts
interface SortablePhoto { avgHue: number; avgLightness: number; isMonochrome: boolean }
function sortPhotosForWall<T extends SortablePhoto>(photos: T[]): T[]

// lib/video/timestamps.ts
function computeFrameTimestamps(durationSeconds: number, frameCount?: number): number[]

// lib/video/sprite.ts (browser)
interface SpriteResult { spriteBlob: Blob; posterBlob: Blob; frameCount: number; frameWidth: number; frameHeight: number }
function generateSpriteSheet(file: File, frameCount?: number, frameWidth?: number): Promise<SpriteResult>

// lib/filters/parse.ts
interface MediaFilters { cameras: string[]; locations: string[]; tags: string[] }
function parseFilters(params: URLSearchParams): MediaFilters

// lib/filters/where.ts
function buildPhotoWhere(f: MediaFilters): Prisma.PhotoWhereInput
function buildVideoWhere(f: MediaFilters): Prisma.VideoWhereInput

// lib/storage/multipart.ts (server)
function createMultipart(key: string, contentType: string): Promise<string>   // returns uploadId
function signPartUrl(key: string, uploadId: string, partNumber: number): Promise<string>
function completeMultipart(key: string, uploadId: string, parts: { ETag: string; PartNumber: number }[]): Promise<string>  // returns public URL

// lib/storage/upload-client.ts (browser)
function uploadFile(file: Blob, filename: string, onProgress?: (pct: number) => void): Promise<string>  // returns public URL

// lib/auth/session.ts
function createSessionToken(): Promise<string>
function verifySessionToken(token: string): Promise<boolean>
```

---

## Task 1: Project scaffold, theme tokens, and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Note: this uses Tailwind v4, which is configured via the `@theme` block in `globals.css` — there is no `tailwind.config.ts`.
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a runnable Next.js app with Tailwind theme tokens (`bg-ink`, `text-gold`, `bg-frame`, etc.) and a working `npm test`

- [ ] **Step 1: Scaffold the Next.js app**

Run in the repo root (the directory already contains `.git` and `docs/`, so scaffold in place):

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --no-turbopack --import-alias "@/*"
```

Answer "yes" to proceeding in a non-empty directory. This overwrites nothing under `docs/`.

- [ ] **Step 2: Install remaining dependencies**

```bash
npm install @prisma/client @prisma/adapter-neon @neondatabase/serverless @aws-sdk/client-s3 @aws-sdk/s3-request-presigner jose bcryptjs zod react-markdown remark-gfm
npm install -D prisma vitest @vitejs/plugin-react jsdom @types/bcryptjs @playwright/test
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 4: Write a smoke test that fails**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SITE_NAME } from '@/lib/site';

describe('site config', () => {
  it('exposes a site name', () => {
    expect(SITE_NAME.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/site`.

- [ ] **Step 6: Create the site config**

Create `src/lib/site.ts`:

```ts
export const SITE_NAME = 'Aldi';
export const SITE_TAGLINE = 'Motion and Stills';

export const NAV_TABS = [
  { href: '/stills', label: 'Stills' },
  { href: '/motion', label: 'Motion' },
  { href: '/journal', label: 'Journal' },
] as const;
```

> The mockup used the placeholder "Alex Morgan"; these are the confirmed real values. `src/lib/site.ts` is the single source of truth for header branding — never hardcode the name or tagline anywhere else.

- [ ] **Step 7: Run the test to confirm it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Add the cinematic gold theme tokens**

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  --color-ink: #0b0b0d;
  --color-frame: #1c1c20;
  --color-film: #141416;
  --color-bone: #f4f4f5;
  --color-ash: #8e8e93;
  --color-gold: #d4af37;
  --color-hairline: rgba(255, 255, 255, 0.1);
  --color-goldline: rgba(212, 175, 55, 0.2);
  --font-mono: "SF Mono", ui-monospace, "Cascadia Mono", Menlo, monospace;
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: var(--color-ink);
  color: var(--color-bone);
}
```

- [ ] **Step 9: Build the root layout and index redirect**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_TAGLINE,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
```

Replace `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/stills');
}
```

- [ ] **Step 10: Create `.env.example`**

```bash
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET=""
R2_PUBLIC_BASE_URL="https://media.example.com"
ADMIN_PASSWORD_HASH=""
SESSION_SECRET=""
```

Confirm `.gitignore` contains `.env`, `.env.local`, `node_modules`, `.next`.

- [ ] **Step 11: Verify the app boots**

Run: `npm run dev`
Expected: `http://localhost:3000` redirects to `/stills` and renders a 404 (no stills page yet) on a near-black background. Stop the server.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with cinematic gold theme and Vitest"
```

---

## Task 2: Database schema

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `src/lib/env.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: Task 1 scaffold
- Produces: `prisma` client models `Photo`, `Video`, `BlogPost`, `Tag`, `PhotoTag`, `VideoTag`; `db` singleton; `env` object

- [ ] **Step 1: Write a failing test for env validation**

Create `tests/unit/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/lib/env';

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgresql://u:p@h/d',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket',
      R2_PUBLIC_BASE_URL: 'https://media.example.com',
      ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
      SESSION_SECRET: 'a'.repeat(32),
    });
    expect(result.R2_BUCKET).toBe('bucket');
  });

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://u:p@h/d',
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
        R2_PUBLIC_BASE_URL: 'https://media.example.com',
        ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
        SESSION_SECRET: 'tooshort',
      }),
    ).toThrow();
  });

  it('rejects a non-URL public media base', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://u:p@h/d',
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
        R2_PUBLIC_BASE_URL: 'not-a-url',
        ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
        SESSION_SECRET: 'a'.repeat(32),
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- env`
Expected: FAIL — cannot resolve `@/lib/env`.

- [ ] **Step 3: Implement env validation**

Create `src/lib/env.ts`:

```ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- env`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Photo {
  id           String     @id @default(cuid())
  imageUrl     String
  width        Int
  height       Int
  location     String
  camera       String
  settings     Json       // See "Deviations" — replaced `filmStock`
  avgHue       Float
  avgLightness Float
  isMonochrome Boolean
  createdAt    DateTime   @default(now())
  tags         PhotoTag[]

  @@index([isMonochrome, avgHue])
}

model Video {
  id             String     @id @default(cuid())
  videoUrl       String
  posterImageUrl String
  spriteUrl      String
  spriteFrames   Int        @default(10)
  title          String
  description    String     @default("") // See "Deviations" — replaced `rollGroup`
  sortOrder      Int        @default(0)  // Set by drag-reordering, never typed
  createdAt      DateTime   @default(now())
  tags           VideoTag[]

  @@index([sortOrder])
}

model BlogPost {
  id              String   @id @default(cuid())
  slug            String   @unique
  title           String
  markdownContent String
  publishedAt     DateTime @default(now())
  draft           Boolean  @default(true)

  @@index([draft, publishedAt])
}

model Tag {
  id     String     @id @default(cuid())
  name   String     @unique
  photos PhotoTag[]
  videos VideoTag[]
}

model PhotoTag {
  photoId String
  tagId   String
  photo   Photo  @relation(fields: [photoId], references: [id], onDelete: Cascade)
  tag     Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([photoId, tagId])
}

model VideoTag {
  videoId String
  tagId   String
  video   Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  tag     Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([videoId, tagId])
}
```

> `width`/`height` on `Photo` replace the spec's `orientation` field — storing real dimensions is strictly more useful, since the wall needs the aspect ratio to size each polaroid and orientation is derivable from it.

- [ ] **Step 6: Create the Prisma client singleton**

Create `src/lib/db.ts`. Prisma 7 requires a driver adapter — a bare
`new PrismaClient()` will not connect:

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

Also create `prisma.config.ts` at the repo root, which is where Prisma 7
reads the Migrate connection URL from:

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

- [ ] **Step 7: Push the schema to the database**

Create `.env` with a real `DATABASE_URL` from Neon, then:

```bash
npx prisma db push
npx prisma generate
```

Expected: `prisma db push` reports the six models created.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, db client, and validated env"
```

---

## Task 3: Color analysis (pure)

**Files:**
- Create: `src/lib/color/analyze.ts`
- Test: `tests/unit/color/analyze.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `rgbToHsl(r, g, b): [number, number, number]`, `analyzePixels(pixels: Uint8ClampedArray, threshold?: number): ColorStats`, `interface ColorStats { avgHue; avgSaturation; avgLightness; isMonochrome }`

**Design note for the implementer:** monochrome detection uses the **mean per-pixel saturation**, not the saturation of the averaged color. This matters: a photo of a red car against a cyan sky averages to muddy gray, and testing the average's saturation would wrongly file it under black-and-white. Averaging each pixel's own saturation keeps it in the color spectrum where it belongs.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/color/analyze.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rgbToHsl, analyzePixels } from '@/lib/color/analyze';

function pixels(...rgb: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgb.length * 4);
  rgb.forEach(([r, g, b], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe('rgbToHsl', () => {
  it('maps pure red to hue 0', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0);
    expect(s).toBeCloseTo(1);
    expect(l).toBeCloseTo(0.5);
  });

  it('maps pure green to hue 120', () => {
    expect(rgbToHsl(0, 255, 0)[0]).toBeCloseTo(120);
  });

  it('maps pure blue to hue 240', () => {
    expect(rgbToHsl(0, 0, 255)[0]).toBeCloseTo(240);
  });

  it('reports zero saturation for gray', () => {
    expect(rgbToHsl(128, 128, 128)[1]).toBeCloseTo(0);
  });
});

describe('analyzePixels', () => {
  it('flags a uniformly gray image as monochrome', () => {
    const result = analyzePixels(pixels([90, 90, 90], [200, 200, 200]));
    expect(result.isMonochrome).toBe(true);
    expect(result.avgSaturation).toBeCloseTo(0);
  });

  it('reports mid lightness for a black-and-white image', () => {
    const result = analyzePixels(pixels([0, 0, 0], [255, 255, 255]));
    expect(result.avgLightness).toBeCloseTo(0.5);
  });

  it('does not flag a saturated image as monochrome even when its average is gray', () => {
    const result = analyzePixels(pixels([255, 0, 0], [0, 255, 255]));
    expect(result.isMonochrome).toBe(false);
    expect(result.avgSaturation).toBeGreaterThan(0.5);
  });

  it('reports a red-dominant image near hue 0', () => {
    const result = analyzePixels(pixels([220, 30, 30], [200, 40, 20]));
    expect(result.isMonochrome).toBe(false);
    expect(result.avgHue).toBeLessThan(20);
  });

  it('ignores fully transparent pixels', () => {
    const buf = new Uint8ClampedArray(8);
    buf.set([255, 0, 0, 0], 0);
    buf.set([0, 0, 255, 255], 4);
    const result = analyzePixels(buf);
    expect(result.avgHue).toBeCloseTo(240);
  });

  it('returns safe defaults for an empty buffer', () => {
    const result = analyzePixels(new Uint8ClampedArray(0));
    expect(result).toEqual({ avgHue: 0, avgSaturation: 0, avgLightness: 0, isMonochrome: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- color/analyze`
Expected: FAIL — cannot resolve `@/lib/color/analyze`.

- [ ] **Step 3: Implement**

Create `src/lib/color/analyze.ts`:

```ts
export interface ColorStats {
  avgHue: number;
  avgSaturation: number;
  avgLightness: number;
  isMonochrome: boolean;
}

export const MONOCHROME_SATURATION_THRESHOLD = 0.12;

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, lightness];

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue: number;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  return [hue * 60, saturation, lightness];
}

export function analyzePixels(
  pixels: Uint8ClampedArray,
  threshold: number = MONOCHROME_SATURATION_THRESHOLD,
): ColorStats {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let satSum = 0;
  let count = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    satSum += rgbToHsl(r, g, b)[1];
    count += 1;
  }

  if (count === 0) {
    return { avgHue: 0, avgSaturation: 0, avgLightness: 0, isMonochrome: true };
  }

  const [avgHue, , avgLightness] = rgbToHsl(rSum / count, gSum / count, bSum / count);
  const avgSaturation = satSum / count;

  return {
    avgHue,
    avgSaturation,
    avgLightness,
    isMonochrome: avgSaturation < threshold,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- color/analyze`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/color/analyze.ts tests/unit/color/analyze.test.ts
git commit -m "feat: add pixel color analysis with per-pixel saturation monochrome detection"
```

---

## Task 4: Wall ordering (pure)

**Files:**
- Create: `src/lib/color/sort.ts`
- Test: `tests/unit/color/sort.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `sortPhotosForWall<T extends SortablePhoto>(photos: T[]): T[]`, `interface SortablePhoto { avgHue; avgLightness; isMonochrome }`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/color/sort.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sortPhotosForWall } from '@/lib/color/sort';

const photo = (id: string, avgHue: number, avgLightness: number, isMonochrome: boolean) => ({
  id,
  avgHue,
  avgLightness,
  isMonochrome,
});

describe('sortPhotosForWall', () => {
  it('places every monochrome photo before every color photo', () => {
    const result = sortPhotosForWall([
      photo('color', 200, 0.5, false),
      photo('mono', 0, 0.5, true),
    ]);
    expect(result.map((p) => p.id)).toEqual(['mono', 'color']);
  });

  it('orders monochrome photos dark to light', () => {
    const result = sortPhotosForWall([
      photo('light', 0, 0.9, true),
      photo('dark', 0, 0.1, true),
      photo('mid', 0, 0.5, true),
    ]);
    expect(result.map((p) => p.id)).toEqual(['dark', 'mid', 'light']);
  });

  it('orders color photos by ascending hue', () => {
    const result = sortPhotosForWall([
      photo('blue', 240, 0.5, false),
      photo('red', 5, 0.5, false),
      photo('green', 120, 0.5, false),
    ]);
    expect(result.map((p) => p.id)).toEqual(['red', 'green', 'blue']);
  });

  it('produces a full monochrome band followed by a hue sweep', () => {
    const result = sortPhotosForWall([
      photo('blue', 240, 0.5, false),
      photo('monoLight', 0, 0.8, true),
      photo('red', 10, 0.5, false),
      photo('monoDark', 0, 0.2, true),
    ]);
    expect(result.map((p) => p.id)).toEqual(['monoDark', 'monoLight', 'red', 'blue']);
  });

  it('does not mutate the input array', () => {
    const input = [photo('b', 240, 0.5, false), photo('a', 10, 0.5, false)];
    const snapshot = input.map((p) => p.id);
    sortPhotosForWall(input);
    expect(input.map((p) => p.id)).toEqual(snapshot);
  });

  it('returns an empty array unchanged', () => {
    expect(sortPhotosForWall([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- color/sort`
Expected: FAIL — cannot resolve `@/lib/color/sort`.

- [ ] **Step 3: Implement**

Create `src/lib/color/sort.ts`:

```ts
export interface SortablePhoto {
  avgHue: number;
  avgLightness: number;
  isMonochrome: boolean;
}

/**
 * Wall order: a monochrome band sorted dark-to-light, followed by the color
 * photos sweeping through the hue circle. Packing the result into justified
 * rows in this order makes the hue progress top-to-bottom as you scroll.
 */
export function sortPhotosForWall<T extends SortablePhoto>(photos: T[]): T[] {
  const monochrome = photos
    .filter((p) => p.isMonochrome)
    .sort((a, b) => a.avgLightness - b.avgLightness);

  const color = photos
    .filter((p) => !p.isMonochrome)
    .sort((a, b) => a.avgHue - b.avgHue);

  return [...monochrome, ...color];
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- color/sort`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/color/sort.ts tests/unit/color/sort.test.ts
git commit -m "feat: add color-gradient wall ordering"
```

---

## Task 5: Sprite frame timestamps (pure)

**Files:**
- Create: `src/lib/video/timestamps.ts`
- Test: `tests/unit/video/timestamps.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `computeFrameTimestamps(durationSeconds: number, frameCount?: number): number[]`, `DEFAULT_SPRITE_FRAMES = 10`

**Design note:** frames are sampled at the **midpoint** of each equal slice — `(i + 0.5) / n` — not at slice boundaries. Sampling at `i / n` puts the first grab at `t=0`, which on most footage is a black or blank frame, and the sprite would open on nothing.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/video/timestamps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeFrameTimestamps, DEFAULT_SPRITE_FRAMES } from '@/lib/video/timestamps';

describe('computeFrameTimestamps', () => {
  it('returns the requested number of frames', () => {
    expect(computeFrameTimestamps(20, 10)).toHaveLength(10);
  });

  it('defaults to ten frames', () => {
    expect(computeFrameTimestamps(20)).toHaveLength(DEFAULT_SPRITE_FRAMES);
  });

  it('samples slice midpoints', () => {
    expect(computeFrameTimestamps(20, 10)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  });

  it('never samples the very first or very last instant', () => {
    const result = computeFrameTimestamps(12, 6);
    expect(result[0]).toBeGreaterThan(0);
    expect(result[result.length - 1]).toBeLessThan(12);
  });

  it('returns ascending timestamps', () => {
    const result = computeFrameTimestamps(37.5, 10);
    const sorted = [...result].sort((a, b) => a - b);
    expect(result).toEqual(sorted);
  });

  it('returns an empty array for a zero-length video', () => {
    expect(computeFrameTimestamps(0, 10)).toEqual([]);
  });

  it('returns an empty array for a non-finite duration', () => {
    expect(computeFrameTimestamps(Number.NaN, 10)).toEqual([]);
    expect(computeFrameTimestamps(Number.POSITIVE_INFINITY, 10)).toEqual([]);
  });

  it('returns an empty array when asked for fewer than one frame', () => {
    expect(computeFrameTimestamps(20, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- video/timestamps`
Expected: FAIL — cannot resolve `@/lib/video/timestamps`.

- [ ] **Step 3: Implement**

Create `src/lib/video/timestamps.ts`:

```ts
export const DEFAULT_SPRITE_FRAMES = 10;

/**
 * Evenly spaced sample points across a clip, taken at the midpoint of each
 * slice so the first grab is never the (usually black) opening frame.
 */
export function computeFrameTimestamps(
  durationSeconds: number,
  frameCount: number = DEFAULT_SPRITE_FRAMES,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (!Number.isInteger(frameCount) || frameCount < 1) return [];

  return Array.from(
    { length: frameCount },
    (_, i) => ((i + 0.5) / frameCount) * durationSeconds,
  );
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- video/timestamps`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video/timestamps.ts tests/unit/video/timestamps.test.ts
git commit -m "feat: add sprite frame timestamp calculation"
```

---

## Task 6: Filter parsing and query building (pure)

**Files:**
- Create: `src/lib/filters/parse.ts`, `src/lib/filters/where.ts`
- Test: `tests/unit/filters/parse.test.ts`, `tests/unit/filters/where.test.ts`

**Interfaces:**
- Consumes: Prisma types from Task 2
- Produces: `interface MediaFilters { cameras: string[]; locations: string[]; tags: string[] }`, `parseFilters(params: URLSearchParams): MediaFilters`, `serializeFilters(f: MediaFilters): URLSearchParams`, `buildPhotoWhere(f)`, `buildVideoWhere(f)`

- [ ] **Step 1: Write the failing parse tests**

Create `tests/unit/filters/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFilters, serializeFilters } from '@/lib/filters/parse';

describe('parseFilters', () => {
  it('returns empty arrays with no query', () => {
    expect(parseFilters(new URLSearchParams())).toEqual({
      cameras: [],
      locations: [],
      tags: [],
    });
  });

  it('splits comma-separated values', () => {
    const result = parseFilters(new URLSearchParams('camera=Leica M6,Contax T2'));
    expect(result.cameras).toEqual(['Leica M6', 'Contax T2']);
  });

  it('reads all three filter types', () => {
    const result = parseFilters(new URLSearchParams('camera=Leica&location=Tokyo&tag=street,night'));
    expect(result).toEqual({
      cameras: ['Leica'],
      locations: ['Tokyo'],
      tags: ['street', 'night'],
    });
  });

  it('drops empty and whitespace-only entries', () => {
    expect(parseFilters(new URLSearchParams('camera=Leica,,  ,Contax')).cameras).toEqual([
      'Leica',
      'Contax',
    ]);
  });

  it('de-duplicates repeated values', () => {
    expect(parseFilters(new URLSearchParams('tag=street,street')).tags).toEqual(['street']);
  });
});

describe('serializeFilters', () => {
  it('omits empty filter types', () => {
    const params = serializeFilters({ cameras: [], locations: ['Tokyo'], tags: [] });
    expect(params.toString()).toBe('location=Tokyo');
  });

  it('round-trips through parseFilters', () => {
    const original = { cameras: ['Leica M6'], locations: ['Tokyo'], tags: ['street', 'night'] };
    expect(parseFilters(serializeFilters(original))).toEqual(original);
  });
});

describe('filtersFromSearchParams', () => {
  it('returns empty filters for an empty object', () => {
    expect(filtersFromSearchParams({})).toEqual({ cameras: [], locations: [], tags: [] });
  });

  it('reads string values', () => {
    expect(filtersFromSearchParams({ camera: 'Leica,Contax' }).cameras).toEqual([
      'Leica',
      'Contax',
    ]);
  });

  it('joins repeated array values', () => {
    expect(filtersFromSearchParams({ tag: ['street', 'night'] }).tags).toEqual([
      'street',
      'night',
    ]);
  });

  it('ignores undefined values', () => {
    expect(filtersFromSearchParams({ camera: undefined }).cameras).toEqual([]);
  });
});
```

Update the import line at the top of this test file to include the new function:

```ts
import { parseFilters, serializeFilters, filtersFromSearchParams } from '@/lib/filters/parse';
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- filters/parse`
Expected: FAIL — cannot resolve `@/lib/filters/parse`.

- [ ] **Step 3: Implement parsing**

Create `src/lib/filters/parse.ts`:

```ts
export interface MediaFilters {
  cameras: string[];
  locations: string[];
  tags: string[];
}

export const EMPTY_FILTERS: MediaFilters = { cameras: [], locations: [], tags: [] };

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  const cleaned = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(cleaned)];
}

export function parseFilters(params: URLSearchParams): MediaFilters {
  return {
    cameras: readList(params, 'camera'),
    locations: readList(params, 'location'),
    tags: readList(params, 'tag'),
  };
}

export function serializeFilters(filters: MediaFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.cameras.length) params.set('camera', filters.cameras.join(','));
  if (filters.locations.length) params.set('location', filters.locations.join(','));
  if (filters.tags.length) params.set('tag', filters.tags.join(','));
  return params;
}

export function hasActiveFilters(filters: MediaFilters): boolean {
  return (
    filters.cameras.length > 0 || filters.locations.length > 0 || filters.tags.length > 0
  );
}

/**
 * Next.js hands page components a plain object whose values may be string,
 * string[], or undefined. Both the Stills and Motion pages need the same
 * normalisation, so it lives here rather than being pasted into each page.
 */
export function filtersFromSearchParams(
  source: Record<string, string | string[] | undefined>,
): MediaFilters {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value.length > 0) params.set(key, value.join(','));
  }
  return parseFilters(params);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- filters/parse`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing where-builder tests**

Create `tests/unit/filters/where.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPhotoWhere, buildVideoWhere } from '@/lib/filters/where';

describe('buildPhotoWhere', () => {
  it('returns an empty clause with no filters', () => {
    expect(buildPhotoWhere({ cameras: [], locations: [], tags: [] })).toEqual({});
  });

  it('uses OR semantics within one filter type', () => {
    expect(buildPhotoWhere({ cameras: ['Leica', 'Contax'], locations: [], tags: [] })).toEqual({
      AND: [{ camera: { in: ['Leica', 'Contax'] } }],
    });
  });

  it('uses AND semantics across filter types', () => {
    const result = buildPhotoWhere({ cameras: ['Leica'], locations: ['Tokyo'], tags: [] });
    expect(result).toEqual({
      AND: [{ camera: { in: ['Leica'] } }, { location: { in: ['Tokyo'] } }],
    });
  });

  it('matches photos carrying any of the requested tags', () => {
    const result = buildPhotoWhere({ cameras: [], locations: [], tags: ['street', 'night'] });
    expect(result).toEqual({
      AND: [{ tags: { some: { tag: { name: { in: ['street', 'night'] } } } } }],
    });
  });
});

describe('buildVideoWhere', () => {
  it('returns an empty clause with no filters', () => {
    expect(buildVideoWhere({ cameras: [], locations: [], tags: [] })).toEqual({});
  });

  it('ignores location, which videos do not carry', () => {
    expect(buildVideoWhere({ cameras: [], locations: ['Tokyo'], tags: [] })).toEqual({});
  });

  it('combines camera and tag filters with AND', () => {
    const result = buildVideoWhere({ cameras: ['RED'], locations: [], tags: ['reel'] });
    expect(result).toEqual({
      AND: [
        { camera: { in: ['RED'] } },
        { tags: { some: { tag: { name: { in: ['reel'] } } } } },
      ],
    });
  });
});
```

- [ ] **Step 6: Run to confirm failure**

Run: `npm test -- filters/where`
Expected: FAIL — cannot resolve `@/lib/filters/where`.

- [ ] **Step 7: Implement the where builders**

Create `src/lib/filters/where.ts`:

```ts
import type { Prisma } from '@prisma/client';
import type { MediaFilters } from './parse';

/**
 * OR within a filter type (two cameras means either camera), AND across
 * types (a camera and a tag means both must match).
 */
export function buildPhotoWhere(filters: MediaFilters): Prisma.PhotoWhereInput {
  const clauses: Prisma.PhotoWhereInput[] = [];

  if (filters.cameras.length) clauses.push({ camera: { in: filters.cameras } });
  if (filters.locations.length) clauses.push({ location: { in: filters.locations } });
  if (filters.tags.length) {
    clauses.push({ tags: { some: { tag: { name: { in: filters.tags } } } } });
  }

  return clauses.length ? { AND: clauses } : {};
}

/** Videos carry no location, so that filter is intentionally ignored here. */
export function buildVideoWhere(filters: MediaFilters): Prisma.VideoWhereInput {
  const clauses: Prisma.VideoWhereInput[] = [];

  if (filters.cameras.length) clauses.push({ camera: { in: filters.cameras } });
  if (filters.tags.length) {
    clauses.push({ tags: { some: { tag: { name: { in: filters.tags } } } } });
  }

  return clauses.length ? { AND: clauses } : {};
}
```

- [ ] **Step 8: Run to confirm pass**

Run: `npm test -- filters`
Expected: PASS (14 tests across both files).

- [ ] **Step 9: Commit**

```bash
git add src/lib/filters tests/unit/filters
git commit -m "feat: add filter parsing and Prisma where builders"
```

---

## Task 7: R2 storage and multipart upload API

**Files:**
- Create: `src/lib/storage/r2.ts`, `src/lib/storage/multipart.ts`
- Create: `src/app/api/upload/create/route.ts`, `src/app/api/upload/part-url/route.ts`, `src/app/api/upload/complete/route.ts`
- Test: `tests/unit/storage/r2.test.ts`

**Interfaces:**
- Consumes: `env()` from Task 2
- Produces: `buildObjectKey(filename: string, prefix: string): string`, `publicUrl(key: string): string`, `createMultipart(key, contentType): Promise<string>`, `signPartUrl(key, uploadId, partNumber): Promise<string>`, `completeMultipart(key, uploadId, parts): Promise<string>`; three POST endpoints under `/api/upload/`

- [ ] **Step 1: Write the failing key-helper tests**

Create `tests/unit/storage/r2.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: () => ({
    DATABASE_URL: 'postgresql://u:p@h/d',
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'bucket',
    R2_PUBLIC_BASE_URL: 'https://media.example.com',
    ADMIN_PASSWORD_HASH: 'hash',
    SESSION_SECRET: 'a'.repeat(32),
  }),
}));

const { buildObjectKey, publicUrl } = await import('@/lib/storage/r2');

describe('buildObjectKey', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  it('namespaces keys under the given prefix', () => {
    expect(buildObjectKey('shot.jpg', 'photos')).toMatch(/^photos\//);
  });

  it('preserves the file extension in lowercase', () => {
    expect(buildObjectKey('CLIP.MP4', 'videos')).toMatch(/\.mp4$/);
  });

  it('slugifies the base name', () => {
    expect(buildObjectKey('Tokyo Shinjuku #3.jpg', 'photos')).toContain('tokyo-shinjuku-3');
  });

  it('produces distinct keys for identical filenames', () => {
    const a = buildObjectKey('shot.jpg', 'photos');
    const b = buildObjectKey('shot.jpg', 'photos');
    expect(a).not.toBe(b);
  });

  it('handles a filename with no extension', () => {
    expect(buildObjectKey('noext', 'photos')).toMatch(/^photos\/noext-/);
  });
});

describe('publicUrl', () => {
  it('joins the public base and key', () => {
    expect(publicUrl('photos/a.jpg')).toBe('https://media.example.com/photos/a.jpg');
  });

  it('does not double the separator when the base has a trailing slash', () => {
    expect(publicUrl('/photos/a.jpg')).toBe('https://media.example.com/photos/a.jpg');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- storage/r2`
Expected: FAIL — cannot resolve `@/lib/storage/r2`.

- [ ] **Step 3: Implement the R2 client and key helpers**

Create `src/lib/storage/r2.ts`:

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';

let client: S3Client | null = null;

export function r2(): S3Client {
  if (client) return client;
  const config = env();
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export function bucket(): string {
  return env().R2_BUCKET;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildObjectKey(filename: string, prefix: string): string {
  const dot = filename.lastIndexOf('.');
  const hasExt = dot > 0;
  const base = slugify(hasExt ? filename.slice(0, dot) : filename) || 'file';
  const ext = hasExt ? filename.slice(dot).toLowerCase() : '';
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}/${base}-${unique}${ext}`;
}

export function publicUrl(key: string): string {
  const base = env().R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/${key.replace(/^\/+/, '')}`;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- storage/r2`
Expected: PASS (7 tests).

- [ ] **Step 5: Implement the multipart helpers**

Create `src/lib/storage/multipart.ts`:

```ts
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, bucket, publicUrl } from './r2';

export interface CompletedPart {
  ETag: string;
  PartNumber: number;
}

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const response = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
  );
  if (!response.UploadId) throw new Error('R2 did not return an upload id');
  return response.UploadId;
}

export async function signPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new UploadPartCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 3600 },
  );
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: CompletedPart[],
): Promise<string> {
  const ordered = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: ordered },
    }),
  );
  return publicUrl(key);
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await r2().send(
    new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }),
  );
}
```

- [ ] **Step 6: Create the three upload endpoints**

Create `src/app/api/upload/create/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { buildObjectKey } from '@/lib/storage/r2';
import { createMultipart } from '@/lib/storage/multipart';

export const runtime = 'nodejs';

const body = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  prefix: z.enum(['photos', 'videos', 'posters', 'sprites']),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  const key = buildObjectKey(parsed.data.filename, parsed.data.prefix);
  const uploadId = await createMultipart(key, parsed.data.contentType);
  return NextResponse.json({ key, uploadId });
}
```

Create `src/app/api/upload/part-url/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { signPartUrl } from '@/lib/storage/multipart';

export const runtime = 'nodejs';

const body = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1).max(10_000),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid part request' }, { status: 400 });
  }

  const url = await signPartUrl(parsed.data.key, parsed.data.uploadId, parsed.data.partNumber);
  return NextResponse.json({ url });
}
```

Create `src/app/api/upload/complete/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { completeMultipart } from '@/lib/storage/multipart';

export const runtime = 'nodejs';

const body = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z
    .array(z.object({ ETag: z.string().min(1), PartNumber: z.number().int().min(1) }))
    .min(1),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid completion request' }, { status: 400 });
  }

  const url = await completeMultipart(parsed.data.key, parsed.data.uploadId, parsed.data.parts);
  return NextResponse.json({ url });
}
```

> These import `requireSession` from Task 9. Implement Task 9 before running the app, or the build will fail on the missing module.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage src/app/api/upload tests/unit/storage
git commit -m "feat: add R2 client and multipart upload endpoints"
```

---

## Task 8: Browser multipart uploader

**Files:**
- Create: `src/lib/storage/upload-client.ts`
- Test: `tests/unit/storage/upload-client.test.ts`

**Interfaces:**
- Consumes: `/api/upload/create`, `/api/upload/part-url`, `/api/upload/complete` from Task 7
- Produces: `uploadFile(file: Blob, filename: string, prefix: UploadPrefix, onProgress?: (pct: number) => void): Promise<string>`, `splitIntoParts(size: number, partSize?: number): { partNumber: number; start: number; end: number }[]`, `type UploadPrefix = 'photos' | 'videos' | 'posters' | 'sprites'`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/storage/upload-client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitIntoParts, uploadFile, MIN_PART_SIZE } from '@/lib/storage/upload-client';

describe('splitIntoParts', () => {
  it('returns a single part for a small file', () => {
    const parts = splitIntoParts(1000);
    expect(parts).toEqual([{ partNumber: 1, start: 0, end: 1000 }]);
  });

  it('splits into equal parts on an exact boundary', () => {
    const parts = splitIntoParts(MIN_PART_SIZE * 2, MIN_PART_SIZE);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({ partNumber: 2, start: MIN_PART_SIZE, end: MIN_PART_SIZE * 2 });
  });

  it('gives the remainder to a final short part', () => {
    const parts = splitIntoParts(MIN_PART_SIZE + 100, MIN_PART_SIZE);
    expect(parts).toHaveLength(2);
    expect(parts[1].end - parts[1].start).toBe(100);
  });

  it('numbers parts from one', () => {
    expect(splitIntoParts(MIN_PART_SIZE * 3, MIN_PART_SIZE).map((p) => p.partNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it('returns no parts for an empty file', () => {
    expect(splitIntoParts(0)).toEqual([]);
  });
});

describe('uploadFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates, uploads every part, and completes', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/upload/create')) {
        return new Response(JSON.stringify({ key: 'photos/a.jpg', uploadId: 'u1' }));
      }
      if (url.endsWith('/api/upload/part-url')) {
        return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
      }
      if (url.endsWith('/api/upload/complete')) {
        const body = JSON.parse(String(init?.body));
        expect(body.parts).toHaveLength(1);
        expect(body.parts[0].ETag).toBe('"etag-1"');
        return new Response(JSON.stringify({ url: 'https://media.example.com/photos/a.jpg' }));
      }
      return new Response('', { status: 200, headers: { ETag: '"etag-1"' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await uploadFile(new Blob(['hello']), 'a.jpg', 'photos');
    expect(url).toBe('https://media.example.com/photos/a.jpg');
  });

  it('reports progress reaching 100', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/upload/create')) {
          return new Response(JSON.stringify({ key: 'k', uploadId: 'u' }));
        }
        if (url.endsWith('/api/upload/part-url')) {
          return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
        }
        if (url.endsWith('/api/upload/complete')) {
          return new Response(JSON.stringify({ url: 'https://media.example.com/k' }));
        }
        return new Response('', { status: 200, headers: { ETag: '"e"' } });
      }),
    );

    const seen: number[] = [];
    await uploadFile(new Blob(['hello']), 'a.jpg', 'photos', (pct) => seen.push(pct));
    expect(seen.at(-1)).toBe(100);
  });

  it('throws when a part upload returns no ETag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/upload/create')) {
          return new Response(JSON.stringify({ key: 'k', uploadId: 'u' }));
        }
        if (url.endsWith('/api/upload/part-url')) {
          return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
        }
        return new Response('', { status: 200 });
      }),
    );

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/ETag/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- storage/upload-client`
Expected: FAIL — cannot resolve `@/lib/storage/upload-client`.

- [ ] **Step 3: Implement**

Create `src/lib/storage/upload-client.ts`:

```ts
export type UploadPrefix = 'photos' | 'videos' | 'posters' | 'sprites';

/** R2 requires every part except the last to be at least 5 MiB. */
export const MIN_PART_SIZE = 5 * 1024 * 1024;

export interface PartRange {
  partNumber: number;
  start: number;
  end: number;
}

export function splitIntoParts(size: number, partSize: number = MIN_PART_SIZE): PartRange[] {
  if (size <= 0) return [];
  if (size <= partSize) return [{ partNumber: 1, start: 0, end: size }];

  const parts: PartRange[] = [];
  let start = 0;
  let partNumber = 1;
  while (start < size) {
    const end = Math.min(start + partSize, size);
    parts.push({ partNumber, start, end });
    start = end;
    partNumber += 1;
  }
  return parts;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Uploads a file to R2 in parts and returns its public URL. Parts are sent
 * sequentially so a failure surfaces the specific part rather than dying
 * somewhere inside a parallel batch — worth it for multi-hundred-MB videos.
 */
export async function uploadFile(
  file: Blob,
  filename: string,
  prefix: UploadPrefix,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { key, uploadId } = await postJson<{ key: string; uploadId: string }>(
    '/api/upload/create',
    { filename, contentType: file.type || 'application/octet-stream', prefix },
  );

  const ranges = splitIntoParts(file.size);
  const completed: { ETag: string; PartNumber: number }[] = [];

  for (const range of ranges) {
    const { url } = await postJson<{ url: string }>('/api/upload/part-url', {
      key,
      uploadId,
      partNumber: range.partNumber,
    });

    const response = await fetch(url, {
      method: 'PUT',
      body: file.slice(range.start, range.end),
    });
    if (!response.ok) {
      throw new Error(`Part ${range.partNumber} failed with status ${response.status}`);
    }

    const etag = response.headers.get('ETag');
    if (!etag) {
      throw new Error(`Part ${range.partNumber} response was missing an ETag header`);
    }

    completed.push({ ETag: etag, PartNumber: range.partNumber });
    onProgress?.(Math.round((completed.length / ranges.length) * 100));
  }

  const { url } = await postJson<{ url: string }>('/api/upload/complete', {
    key,
    uploadId,
    parts: completed,
  });
  return url;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- storage/upload-client`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/upload-client.ts tests/unit/storage/upload-client.test.ts
git commit -m "feat: add browser multipart uploader"
```

---

## Task 9: Authentication

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/session.ts`, `src/lib/auth/guard.ts`, `src/proxy.ts`
- Create: `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/login/page.tsx`
- Create: `scripts/hash-password.mjs`
- Test: `tests/unit/auth/session.test.ts`

**Interfaces:**
- Consumes: `env()` from Task 2
- Produces: `createSessionToken(): Promise<string>`, `verifySessionToken(token: string): Promise<boolean>`, `SESSION_COOKIE = 'portfolio_session'`, `requireSession(): Promise<NextResponse | null>`

**Next.js 16 convention:** the `middleware.ts` filename and its `middleware` export are deprecated, replaced by `proxy.ts` exporting a function named `proxy`. This project uses `proxy.ts`. Its runtime is Node and is not configurable.

**Runtime note for the implementer:** password verification with `bcryptjs` lives only in the login route (pinned to `runtime = 'nodejs'`), never in `proxy.ts`. Session verification uses `jose`, which is Web Crypto based — keep it there rather than reaching for `bcryptjs`, so the gate stays fast on every `/admin` request and portable if the route ever moves.

- [ ] **Step 1: Write the failing session tests**

Create `tests/unit/auth/session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: () => ({ SESSION_SECRET: 'x'.repeat(32) }),
}));

const { createSessionToken, verifySessionToken } = await import('@/lib/auth/session');

describe('session tokens', () => {
  it('accepts a token it just issued', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(`${token}x`)).toBe(false);
  });

  it('rejects an empty token', async () => {
    expect(await verifySessionToken('')).toBe(false);
  });

  it('rejects arbitrary text', async () => {
    expect(await verifySessionToken('not.a.jwt')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- auth/session`
Expected: FAIL — cannot resolve `@/lib/auth/session`.

- [ ] **Step 3: Implement session handling**

Create `src/lib/auth/session.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';

export const SESSION_COOKIE = 'portfolio_session';
const SESSION_TTL = '7d';

function secret(): Uint8Array {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === 'admin';
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- auth/session`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement password hashing and the guard**

Create `src/lib/auth/password.ts`:

```ts
import bcrypt from 'bcryptjs';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
```

Create `src/lib/auth/guard.ts`:

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './session';

/** Returns a 401 response when unauthenticated, or null when the caller may proceed. */
export async function requireSession(): Promise<NextResponse | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? '';
  const valid = await verifySessionToken(token);
  return valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value ?? '');
}
```

- [ ] **Step 6: Add the proxy gate**

Create `src/proxy.ts` (Next.js 16's replacement for `middleware.ts` — the file
must be named `proxy.ts` and the export must be named `proxy`):

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? '';
  if (await verifySessionToken(token)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ['/admin/:path*'] };
```

- [ ] **Step 7: Add the login and logout routes**

Create `src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';

const body = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your password' }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.data.password, env().ADMIN_PASSWORD_HASH);
  if (!ok) {
    return NextResponse.json({ error: 'That password is incorrect' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
```

Create `src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
```

- [ ] **Step 8: Build the login page**

Create `src/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.push(params.get('next') ?? '/admin');
      router.refresh();
      return;
    }

    const data = await response.json().catch(() => ({ error: 'Login failed' }));
    setError(data.error ?? 'Login failed');
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-mono text-xs uppercase tracking-[0.2em] text-ash">Admin access</h1>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="rounded border border-hairline bg-frame px-3 py-2 text-bone outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-gold px-3 py-2 text-gold transition hover:bg-gold/10 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 9: Add a password-hashing helper script**

Create `scripts/hash-password.mjs`:

```js
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"');
  process.exit(1);
}

console.log(await bcrypt.hash(password, 12));
```

Generate your credentials and put them in `.env`:

```bash
node scripts/hash-password.mjs "your-chosen-password"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the first into `ADMIN_PASSWORD_HASH` and the second into `SESSION_SECRET`.

- [ ] **Step 10: Verify the gate manually**

Run `npm run dev`, visit `http://localhost:3000/admin`.
Expected: redirected to `/login?next=/admin`. Enter the wrong password → "That password is incorrect". Enter the right one → redirected to `/admin` (404 until Task 10). Stop the server.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add single-admin password auth with edge-safe session gate"
```

---

## Task 10: Admin shell and dashboard

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`
- Create: `src/components/admin/AdminNav.tsx`

**Interfaces:**
- Consumes: `db` (Task 2), the `proxy.ts` auth gate (Task 9)
- Produces: admin chrome at `/admin` listing counts and links to the three content sections

- [ ] **Step 1: Build the admin navigation**

Create `src/components/admin/AdminNav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/photos', label: 'Photos' },
  { href: '/admin/videos', label: 'Videos' },
  { href: '/admin/posts', label: 'Posts' },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="mb-8 flex items-center gap-6 border-b border-hairline pb-4">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={
            pathname === link.href
              ? 'text-sm text-gold'
              : 'text-sm text-ash transition hover:text-bone'
          }
        >
          {link.label}
        </Link>
      ))}
      <button onClick={signOut} className="ml-auto text-sm text-ash transition hover:text-bone">
        Sign out
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Build the admin layout**

Create `src/app/admin/layout.tsx`:

```tsx
import { AdminNav } from '@/components/admin/AdminNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <AdminNav />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Build the dashboard**

Create `src/app/admin/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [photos, videos, posts, drafts] = await Promise.all([
    db.photo.count(),
    db.video.count(),
    db.blogPost.count(),
    db.blogPost.count({ where: { draft: true } }),
  ]);

  const cards = [
    { href: '/admin/photos', label: 'Photos', value: photos, note: 'Ordered automatically by color' },
    { href: '/admin/videos', label: 'Videos', value: videos, note: 'Ordered manually within each roll' },
    { href: '/admin/posts', label: 'Posts', value: posts, note: `${drafts} in draft` },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="rounded border border-hairline bg-frame p-5 transition hover:border-gold"
        >
          <div className="font-mono text-xs uppercase tracking-[0.15em] text-ash">{card.label}</div>
          <div className="mt-2 text-3xl">{card.value}</div>
          <div className="mt-1 text-xs text-ash">{card.note}</div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Run `npm run dev`, sign in, visit `/admin`.
Expected: three cards reading 0, and a working "Sign out" that returns you to `/login`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/components/admin
git commit -m "feat: add admin shell and dashboard"
```

---

## Task 11: Photo admin (upload, analyze, CRUD)

**Files:**
- Create: `src/lib/color/analyze-image.ts`
- Create: `src/lib/tags.ts`
- Create: `src/app/admin/photos/page.tsx`, `src/app/admin/photos/[id]/page.tsx`
- Create: `src/app/admin/photos/actions.ts`
- Create: `src/components/admin/UploadField.tsx`, `src/components/admin/TagInput.tsx`, `src/components/admin/PhotoForm.tsx`
- Test: `tests/unit/tags.test.ts`

**Interfaces:**
- Consumes: `analyzePixels` (Task 3), `uploadFile` (Task 8), `db` (Task 2)
- Produces: `analyzeImageFile(file: File): Promise<ImageAnalysis>`, `parseTagNames(input: string): string[]`, `tagConnections(tagsRaw: string): Promise<{ tagId: string }[]>`, `FIELD` class constant, `savePhoto`/`deletePhoto` server actions

- [ ] **Step 1: Write the failing tag-parsing tests**

Create `tests/unit/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTagNames } from '@/lib/tags';

describe('parseTagNames', () => {
  it('splits on commas', () => {
    expect(parseTagNames('street, night')).toEqual(['street', 'night']);
  });

  it('lowercases and trims', () => {
    expect(parseTagNames('  Street ,  NIGHT ')).toEqual(['street', 'night']);
  });

  it('removes duplicates', () => {
    expect(parseTagNames('street, Street, STREET')).toEqual(['street']);
  });

  it('drops empty entries', () => {
    expect(parseTagNames('street,,  ,night')).toEqual(['street', 'night']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseTagNames('')).toEqual([]);
    expect(parseTagNames('   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- tags`
Expected: FAIL — cannot resolve `@/lib/tags`.

- [ ] **Step 3: Implement tag parsing**

Create `src/lib/tags.ts`. Both the photo and video actions need to turn a
comma-separated string into tag rows, so the upsert helper lives here too —
never copy it into an actions file.

```ts
import { db } from '@/lib/db';

export function parseTagNames(input: string): string[] {
  const names = input
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

/**
 * Upserts each named tag and returns join-table rows ready to `create`.
 * Shared by the photo and video actions.
 */
export async function tagConnections(tagsRaw: string): Promise<{ tagId: string }[]> {
  const names = parseTagNames(tagsRaw);
  const tags = await Promise.all(
    names.map((name) => db.tag.upsert({ where: { name }, create: { name }, update: {} })),
  );
  return tags.map((tag) => ({ tagId: tag.id }));
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- tags`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement browser image analysis**

Create `src/lib/color/analyze-image.ts`:

```ts
import { analyzePixels, type ColorStats } from './analyze';

export interface ImageAnalysis extends ColorStats {
  width: number;
  height: number;
}

/** Downsample width used for color analysis — plenty for an average, and fast. */
const SAMPLE_WIDTH = 100;

export async function analyzeImageFile(file: File): Promise<ImageAnalysis> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, SAMPLE_WIDTH / bitmap.width);
    const sampleWidth = Math.max(1, Math.round(bitmap.width * scale));
    const sampleHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not get a 2D canvas context');

    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);

    return {
      ...analyzePixels(data),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 6: Build the reusable upload field**

Create `src/components/admin/UploadField.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { uploadFile, type UploadPrefix } from '@/lib/storage/upload-client';

interface Props {
  label: string;
  accept: string;
  prefix: UploadPrefix;
  value: string;
  onUploaded: (url: string, file: File) => void | Promise<void>;
  hint?: string;
  warnAboveBytes?: number;
}

export function UploadField({
  label,
  accept,
  prefix,
  value,
  onUploaded,
  hint,
  warnAboveBytes,
}: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setWarning(
      warnAboveBytes && file.size > warnAboveBytes
        ? `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB — larger than expected. Upload the compressed web encode, not the 4K master.`
        : '',
    );

    try {
      setProgress(0);
      const url = await uploadFile(file, file.name, prefix, setProgress);
      await onUploaded(url, file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
    } finally {
      setProgress(null);
    }
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-ash">{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="text-sm text-ash file:mr-3 file:rounded file:border file:border-hairline file:bg-frame file:px-3 file:py-1 file:text-bone"
      />
      {hint ? <span className="text-xs text-ash">{hint}</span> : null}
      {progress !== null ? <span className="text-xs text-gold">Uploading… {progress}%</span> : null}
      {warning ? <span className="text-xs text-amber-400">{warning}</span> : null}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
      {value ? <span className="truncate text-xs text-ash">Stored: {value}</span> : null}
    </label>
  );
}
```

- [ ] **Step 7: Build the tag input**

Create `src/components/admin/TagInput.tsx`:

```tsx
'use client';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function TagInput({ value, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-ash">Tags</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="street, night, tokyo"
        className="rounded border border-hairline bg-frame px-3 py-2 text-bone outline-none focus:border-gold"
      />
      <span className="text-xs text-ash">Comma separated. New tags are created automatically.</span>
    </label>
  );
}
```

- [ ] **Step 8: Write the photo server actions**

Create `src/app/admin/photos/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { tagConnections } from '@/lib/tags';

const photoSchema = z.object({
  id: z.string().optional(),
  imageUrl: z.string().url('Upload an image before saving'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  location: z.string().min(1, 'Location is required'),
  camera: z.string().min(1, 'Camera is required'),
  filmStock: z.string().min(1, 'Film stock or lens is required'),
  avgHue: z.number(),
  avgLightness: z.number(),
  isMonochrome: z.boolean(),
  tags: z.string(),
});

export type PhotoInput = z.infer<typeof photoSchema>;

export async function savePhoto(input: PhotoInput): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, tags, ...data } = parsed.data;
  const connections = await tagConnections(tags);

  if (id) {
    await db.photoTag.deleteMany({ where: { photoId: id } });
    await db.photo.update({
      where: { id },
      data: { ...data, tags: { create: connections } },
    });
  } else {
    await db.photo.create({ data: { ...data, tags: { create: connections } } });
  }

  revalidatePath('/admin/photos');
  revalidatePath('/stills');
  return {};
}

export async function deletePhoto(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };
  await db.photo.delete({ where: { id } });
  revalidatePath('/admin/photos');
  revalidatePath('/stills');
  return {};
}
```

- [ ] **Step 9: Build the photo form**

First create the shared field styling, `src/components/admin/fields.ts` — every
admin form input uses this, so it is defined once:

```ts
export const FIELD =
  'rounded border border-hairline bg-frame px-3 py-2 text-bone outline-none focus:border-gold';
```

Then create `src/components/admin/PhotoForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadField } from './UploadField';
import { TagInput } from './TagInput';
import { FIELD } from './fields';
import { analyzeImageFile } from '@/lib/color/analyze-image';
import { savePhoto, type PhotoInput } from '@/app/admin/photos/actions';

export function PhotoForm({ initial }: { initial?: Partial<PhotoInput> & { id?: string } }) {
  const router = useRouter();
  const [form, setForm] = useState<PhotoInput>({
    id: initial?.id,
    imageUrl: initial?.imageUrl ?? '',
    width: initial?.width ?? 0,
    height: initial?.height ?? 0,
    location: initial?.location ?? '',
    camera: initial?.camera ?? '',
    filmStock: initial?.filmStock ?? '',
    avgHue: initial?.avgHue ?? 0,
    avgLightness: initial?.avgLightness ?? 0,
    isMonochrome: initial?.isMonochrome ?? false,
    tags: initial?.tags ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PhotoInput>(key: K, value: PhotoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUploaded(url: string, file: File) {
    const analysis = await analyzeImageFile(file);
    setForm((prev) => ({
      ...prev,
      imageUrl: url,
      width: analysis.width,
      height: analysis.height,
      avgHue: analysis.avgHue,
      avgLightness: analysis.avgLightness,
      isMonochrome: analysis.isMonochrome,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await savePhoto(form);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push('/admin/photos');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <UploadField
        label="Photo"
        accept="image/*"
        prefix="photos"
        value={form.imageUrl}
        onUploaded={handleUploaded}
      />

      {form.imageUrl ? (
        <p className="font-mono text-xs text-ash">
          {form.width}×{form.height} · hue {Math.round(form.avgHue)}° ·{' '}
          {form.isMonochrome ? 'black & white' : 'color'}
        </p>
      ) : null}

      <input
        className={FIELD}
        placeholder="Location (e.g. Tokyo / Shinjuku)"
        value={form.location}
        onChange={(e) => set('location', e.target.value)}
      />
      <input
        className={FIELD}
        placeholder="Camera (e.g. Leica M6)"
        value={form.camera}
        onChange={(e) => set('camera', e.target.value)}
      />
      <input
        className={FIELD}
        placeholder="Film stock or lens (e.g. Portra 400)"
        value={form.filmStock}
        onChange={(e) => set('filmStock', e.target.value)}
      />

      <TagInput value={form.tags} onChange={(value) => set('tags', value)} />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded border border-gold px-4 py-2 text-gold transition hover:bg-gold/10 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save photo'}
      </button>
    </form>
  );
}
```

- [ ] **Step 10: Build the photo list and edit pages**

Create `src/app/admin/photos/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/lib/db';
import { PhotoForm } from '@/components/admin/PhotoForm';

export const dynamic = 'force-dynamic';

export default async function AdminPhotosPage() {
  const photos = await db.photo.findMany({
    orderBy: { createdAt: 'desc' },
    include: { tags: { include: { tag: true } } },
  });

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ash">Add a photo</h2>
        <PhotoForm />
      </section>

      <section>
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ash">
          All photos ({photos.length})
        </h2>
        <ul className="flex flex-col divide-y divide-hairline">
          {photos.map((photo) => (
            <li key={photo.id} className="flex items-center gap-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.imageUrl} alt="" className="h-12 w-16 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{photo.location}</div>
                <div className="truncate font-mono text-xs text-ash">
                  {photo.camera} · {photo.filmStock}
                  {photo.tags.length ? ` · ${photo.tags.map((t) => t.tag.name).join(', ')}` : ''}
                </div>
              </div>
              <Link href={`/admin/photos/${photo.id}`} className="text-sm text-gold">
                Edit
              </Link>
            </li>
          ))}
        </ul>
        {photos.length === 0 ? <p className="text-sm text-ash">No photos yet.</p> : null}
      </section>
    </div>
  );
}
```

Create `src/app/admin/photos/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PhotoForm } from '@/components/admin/PhotoForm';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { deletePhoto } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await db.photo.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });
  if (!photo) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-ash">Edit photo</h2>
      <PhotoForm
        initial={{
          id: photo.id,
          imageUrl: photo.imageUrl,
          width: photo.width,
          height: photo.height,
          location: photo.location,
          camera: photo.camera,
          filmStock: photo.filmStock,
          avgHue: photo.avgHue,
          avgLightness: photo.avgLightness,
          isMonochrome: photo.isMonochrome,
          tags: photo.tags.map((t) => t.tag.name).join(', '),
        }}
      />
      <DeleteButton id={photo.id} action={deletePhoto} redirectTo="/admin/photos" label="Delete photo" />
    </div>
  );
}
```

Create `src/components/admin/DeleteButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  action: (id: string) => Promise<{ error?: string }>;
  redirectTo: string;
  label: string;
}

export function DeleteButton({ id, action, redirectTo, label }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    const result = await action(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="self-start text-sm text-ash transition hover:text-red-400"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-ash">This cannot be undone.</span>
      <button onClick={remove} className="text-sm text-red-400">
        Delete
      </button>
      <button onClick={() => setConfirming(false)} className="text-sm text-ash">
        Cancel
      </button>
      {error ? <span className="text-sm text-red-400">{error}</span> : null}
    </div>
  );
}
```

- [ ] **Step 11: Verify manually**

Run `npm run dev`, sign in, go to `/admin/photos`, upload a photo, fill the fields, save.
Expected: the upload shows progress, the analysis line reports dimensions and hue, and the photo appears in the list. Upload a black-and-white photo and confirm it reports "black & white". Stop the server.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add photo admin with client-side color analysis"
```

---

## Task 12: Video admin (sprite generation, CRUD)

**Files:**
- Create: `src/lib/video/sprite.ts`
- Create: `src/app/admin/videos/page.tsx`, `src/app/admin/videos/[id]/page.tsx`, `src/app/admin/videos/actions.ts`
- Create: `src/components/admin/VideoForm.tsx`

**Interfaces:**
- Consumes: `computeFrameTimestamps` (Task 5), `uploadFile` (Task 8), `tagConnections`/`FIELD` (Task 11), `UploadField`/`TagInput`/`DeleteButton` (Task 11)
- Produces: `generateSpriteSheet(file: File, frameCount?: number, frameWidth?: number): Promise<SpriteResult>`, `saveVideo`/`deleteVideo` server actions

- [ ] **Step 1: Implement sprite generation**

Create `src/lib/video/sprite.ts`:

```ts
import { computeFrameTimestamps, DEFAULT_SPRITE_FRAMES } from './timestamps';

export interface SpriteResult {
  spriteBlob: Blob;
  posterBlob: Blob;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
}

const DEFAULT_FRAME_WIDTH = 320;

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Could not seek to ${time.toFixed(2)}s`));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

function loadMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not read video metadata'));
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas produced no image'))),
      'image/webp',
      quality,
    );
  });
}

/**
 * Extracts evenly spaced frames from a video entirely in the browser and
 * tiles them into one horizontal strip. Keeping this client-side is what
 * lets the project avoid any server-side video processing.
 */
export async function generateSpriteSheet(
  file: File,
  frameCount: number = DEFAULT_SPRITE_FRAMES,
  frameWidth: number = DEFAULT_FRAME_WIDTH,
): Promise<SpriteResult> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';

  try {
    await loadMetadata(video);

    const timestamps = computeFrameTimestamps(video.duration, frameCount);
    if (timestamps.length === 0) {
      throw new Error('Video duration could not be determined');
    }

    const aspect = video.videoHeight / video.videoWidth;
    const frameHeight = Math.round(frameWidth * aspect);

    const sprite = document.createElement('canvas');
    sprite.width = frameWidth * timestamps.length;
    sprite.height = frameHeight;
    const spriteContext = sprite.getContext('2d');
    if (!spriteContext) throw new Error('Could not get a 2D canvas context');

    const poster = document.createElement('canvas');
    poster.width = frameWidth;
    poster.height = frameHeight;
    const posterContext = poster.getContext('2d');
    if (!posterContext) throw new Error('Could not get a 2D canvas context');

    for (let i = 0; i < timestamps.length; i += 1) {
      await seekTo(video, timestamps[i]);
      spriteContext.drawImage(video, i * frameWidth, 0, frameWidth, frameHeight);
      if (i === 0) posterContext.drawImage(video, 0, 0, frameWidth, frameHeight);
    }

    return {
      spriteBlob: await toBlob(sprite, 0.72),
      posterBlob: await toBlob(poster, 0.8),
      frameCount: timestamps.length,
      frameWidth,
      frameHeight,
    };
  } finally {
    video.src = '';
    URL.revokeObjectURL(objectUrl);
  }
}
```

- [ ] **Step 2: Write the video server actions**

Create `src/app/admin/videos/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { tagConnections } from '@/lib/tags';

const videoSchema = z.object({
  id: z.string().optional(),
  videoUrl: z.string().url('Upload a video before saving'),
  posterImageUrl: z.string().url('The poster image failed to generate'),
  spriteUrl: z.string().url('The preview sprite failed to generate'),
  spriteFrames: z.number().int().positive(),
  title: z.string().min(1, 'Title is required'),
  camera: z.string().min(1, 'Camera is required'),
  format: z.string().min(1, 'Format is required'),
  fps: z.string().min(1, 'Frame rate is required'),
  iso: z.string().min(1, 'ISO is required'),
  rollGroup: z.string().min(1, 'Roll is required'),
  sortOrder: z.number().int(),
  tags: z.string(),
});

export type VideoInput = z.infer<typeof videoSchema>;

export async function saveVideo(input: VideoInput): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = videoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, tags, ...data } = parsed.data;
  const connections = await tagConnections(tags);

  if (id) {
    await db.videoTag.deleteMany({ where: { videoId: id } });
    await db.video.update({ where: { id }, data: { ...data, tags: { create: connections } } });
  } else {
    await db.video.create({ data: { ...data, tags: { create: connections } } });
  }

  revalidatePath('/admin/videos');
  revalidatePath('/motion');
  return {};
}

export async function deleteVideo(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };
  await db.video.delete({ where: { id } });
  revalidatePath('/admin/videos');
  revalidatePath('/motion');
  return {};
}
```

- [ ] **Step 3: Build the video form**

Create `src/components/admin/VideoForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadField } from './UploadField';
import { TagInput } from './TagInput';
import { FIELD } from './fields';
import { generateSpriteSheet } from '@/lib/video/sprite';
import { uploadFile } from '@/lib/storage/upload-client';
import { saveVideo, type VideoInput } from '@/app/admin/videos/actions';

/** Compressed web encodes should land well under this; a 4K master will not. */
const LARGE_FILE_WARNING_BYTES = 400 * 1024 * 1024;

export function VideoForm({ initial }: { initial?: Partial<VideoInput> & { id?: string } }) {
  const router = useRouter();
  const [form, setForm] = useState<VideoInput>({
    id: initial?.id,
    videoUrl: initial?.videoUrl ?? '',
    posterImageUrl: initial?.posterImageUrl ?? '',
    spriteUrl: initial?.spriteUrl ?? '',
    spriteFrames: initial?.spriteFrames ?? 10,
    title: initial?.title ?? '',
    camera: initial?.camera ?? '',
    format: initial?.format ?? '',
    fps: initial?.fps ?? '',
    iso: initial?.iso ?? '',
    rollGroup: initial?.rollGroup ?? '',
    sortOrder: initial?.sortOrder ?? 0,
    tags: initial?.tags ?? '',
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set<K extends keyof VideoInput>(key: K, value: VideoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUploaded(url: string, file: File) {
    setStatus('Extracting preview frames…');
    try {
      const sprite = await generateSpriteSheet(file);
      setStatus('Uploading preview…');
      const [spriteUrl, posterUrl] = await Promise.all([
        uploadFile(sprite.spriteBlob, `${file.name}-sprite.webp`, 'sprites'),
        uploadFile(sprite.posterBlob, `${file.name}-poster.webp`, 'posters'),
      ]);
      setForm((prev) => ({
        ...prev,
        videoUrl: url,
        spriteUrl,
        posterImageUrl: posterUrl,
        spriteFrames: sprite.frameCount,
      }));
      setStatus('Preview ready.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview generation failed');
      setStatus('');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await saveVideo(form);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push('/admin/videos');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <UploadField
        label="Video"
        accept="video/*"
        prefix="videos"
        value={form.videoUrl}
        onUploaded={handleUploaded}
        hint="Upload the 1080p web encode (~5–8 Mbps), not the 4K master."
        warnAboveBytes={LARGE_FILE_WARNING_BYTES}
      />

      {status ? <p className="text-xs text-gold">{status}</p> : null}

      {form.spriteUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.spriteUrl} alt="Preview frames" className="rounded border border-hairline" />
      ) : null}

      <input className={FIELD} placeholder="Title" value={form.title} onChange={(e) => set('title', e.target.value)} />
      <input className={FIELD} placeholder="Camera (e.g. RED Komodo 6K)" value={form.camera} onChange={(e) => set('camera', e.target.value)} />
      <input className={FIELD} placeholder="Format (e.g. 35mm)" value={form.format} onChange={(e) => set('format', e.target.value)} />
      <input className={FIELD} placeholder="Frame rate (e.g. 24fps)" value={form.fps} onChange={(e) => set('fps', e.target.value)} />
      <input className={FIELD} placeholder="ISO (e.g. 800)" value={form.iso} onChange={(e) => set('iso', e.target.value)} />
      <input className={FIELD} placeholder="Roll (e.g. Iceland)" value={form.rollGroup} onChange={(e) => set('rollGroup', e.target.value)} />
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-ash">Order within roll</span>
        <input
          type="number"
          className={FIELD}
          value={form.sortOrder}
          onChange={(e) => set('sortOrder', Number(e.target.value))}
        />
      </label>

      <TagInput value={form.tags} onChange={(value) => set('tags', value)} />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded border border-gold px-4 py-2 text-gold transition hover:bg-gold/10 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save video'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Build the video list and edit pages**

Create `src/app/admin/videos/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/lib/db';
import { VideoForm } from '@/components/admin/VideoForm';

export const dynamic = 'force-dynamic';

export default async function AdminVideosPage() {
  const videos = await db.video.findMany({
    orderBy: [{ rollGroup: 'asc' }, { sortOrder: 'asc' }],
    include: { tags: { include: { tag: true } } },
  });

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ash">Add a video</h2>
        <VideoForm />
      </section>

      <section>
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ash">
          All videos ({videos.length})
        </h2>
        <ul className="flex flex-col divide-y divide-hairline">
          {videos.map((video) => (
            <li key={video.id} className="flex items-center gap-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={video.posterImageUrl} alt="" className="h-12 w-16 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{video.title}</div>
                <div className="truncate font-mono text-xs text-ash">
                  {video.rollGroup} #{video.sortOrder} · {video.camera}
                </div>
              </div>
              <Link href={`/admin/videos/${video.id}`} className="text-sm text-gold">
                Edit
              </Link>
            </li>
          ))}
        </ul>
        {videos.length === 0 ? <p className="text-sm text-ash">No videos yet.</p> : null}
      </section>
    </div>
  );
}
```

Create `src/app/admin/videos/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { VideoForm } from '@/components/admin/VideoForm';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { deleteVideo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await db.video.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });
  if (!video) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-ash">Edit video</h2>
      <VideoForm
        initial={{
          id: video.id,
          videoUrl: video.videoUrl,
          posterImageUrl: video.posterImageUrl,
          spriteUrl: video.spriteUrl,
          spriteFrames: video.spriteFrames,
          title: video.title,
          camera: video.camera,
          format: video.format,
          fps: video.fps,
          iso: video.iso,
          rollGroup: video.rollGroup,
          sortOrder: video.sortOrder,
          tags: video.tags.map((t) => t.tag.name).join(', '),
        }}
      />
      <DeleteButton id={video.id} action={deleteVideo} redirectTo="/admin/videos" label="Delete video" />
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

Run `npm run dev`, go to `/admin/videos`, upload a short test video.
Expected: after the upload, "Extracting preview frames…" appears, then a wide filmstrip image renders showing 10 distinct frames. Save and confirm it appears in the list. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add video admin with client-side sprite generation"
```

---

## Task 13: Blog admin (Markdown editor)

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/app/admin/posts/page.tsx`, `src/app/admin/posts/[id]/page.tsx`, `src/app/admin/posts/actions.ts`
- Create: `src/components/admin/MarkdownEditor.tsx`, `src/components/admin/PostForm.tsx`
- Test: `tests/unit/slug.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2), `DeleteButton` (Task 11)
- Produces: `slugify(title: string): string`, `savePost`/`deletePost` server actions

- [ ] **Step 1: Write the failing slug tests**

Create `tests/unit/slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Shooting Portra in Tokyo')).toBe('shooting-portra-in-tokyo');
  });

  it('strips punctuation', () => {
    expect(slugify('Why I Shoot Film (Still!)')).toBe('why-i-shoot-film-still');
  });

  it('collapses repeated separators', () => {
    expect(slugify('a   ---   b')).toBe('a-b');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('falls back to "post" for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('post');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- slug`
Expected: FAIL — cannot resolve `@/lib/slug`.

- [ ] **Step 3: Implement**

Create `src/lib/slug.ts`:

```ts
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'post';
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- slug`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the post server actions**

Create `src/app/admin/posts/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { slugify } from '@/lib/slug';

const postSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  markdownContent: z.string().min(1, 'Write something before saving'),
  draft: z.boolean(),
});

export type PostInput = z.infer<typeof postSchema>;

async function uniqueSlug(title: string, currentId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;

  for (;;) {
    const existing = await db.blogPost.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === currentId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function savePost(input: PostInput): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, ...data } = parsed.data;
  const slug = await uniqueSlug(data.title, id);

  if (id) {
    await db.blogPost.update({ where: { id }, data: { ...data, slug } });
  } else {
    await db.blogPost.create({ data: { ...data, slug } });
  }

  revalidatePath('/admin/posts');
  revalidatePath('/journal');
  revalidatePath(`/journal/${slug}`);
  return {};
}

export async function deletePost(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };
  await db.blogPost.delete({ where: { id } });
  revalidatePath('/admin/posts');
  revalidatePath('/journal');
  return {};
}
```

- [ ] **Step 6: Build the Markdown editor**

Create `src/components/admin/MarkdownEditor.tsx`:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-ash">Markdown</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={22}
          spellCheck
          className="rounded border border-hairline bg-frame p-3 font-mono text-sm text-bone outline-none focus:border-gold"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-ash">Preview</span>
        <div className="prose-portfolio min-h-[10rem] rounded border border-hairline bg-frame p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
```

Append the shared prose styling to `src/app/globals.css`:

```css
.prose-portfolio {
  color: var(--color-bone);
  line-height: 1.75;
}
.prose-portfolio h1,
.prose-portfolio h2,
.prose-portfolio h3 {
  color: var(--color-bone);
  font-weight: 600;
  margin: 1.5em 0 0.5em;
}
.prose-portfolio p { margin: 0 0 1em; }
.prose-portfolio a { color: var(--color-gold); text-decoration: underline; }
.prose-portfolio ul { list-style: disc; padding-left: 1.25em; margin: 0 0 1em; }
.prose-portfolio ol { list-style: decimal; padding-left: 1.25em; margin: 0 0 1em; }
.prose-portfolio blockquote {
  border-left: 2px solid var(--color-gold);
  padding-left: 1em;
  color: var(--color-ash);
  margin: 0 0 1em;
}
.prose-portfolio code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
.prose-portfolio pre {
  background: var(--color-film);
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0 0 1em;
}
.prose-portfolio img { max-width: 100%; border-radius: 3px; }
```

- [ ] **Step 7: Build the post form**

Create `src/components/admin/PostForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MarkdownEditor } from './MarkdownEditor';
import { savePost, type PostInput } from '@/app/admin/posts/actions';

export function PostForm({ initial }: { initial?: Partial<PostInput> & { id?: string } }) {
  const router = useRouter();
  const [form, setForm] = useState<PostInput>({
    id: initial?.id,
    title: initial?.title ?? '',
    markdownContent: initial?.markdownContent ?? '',
    draft: initial?.draft ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await savePost(form);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push('/admin/posts');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input
        placeholder="Post title"
        value={form.title}
        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        className="rounded border border-hairline bg-frame px-3 py-2 text-bone outline-none focus:border-gold"
      />

      <MarkdownEditor
        value={form.markdownContent}
        onChange={(value) => setForm((prev) => ({ ...prev, markdownContent: value }))}
      />

      <label className="flex items-center gap-2 text-sm text-ash">
        <input
          type="checkbox"
          checked={form.draft}
          onChange={(e) => setForm((prev) => ({ ...prev, draft: e.target.checked }))}
        />
        Keep as draft (hidden from the public journal)
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded border border-gold px-4 py-2 text-gold transition hover:bg-gold/10 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save post'}
      </button>
    </form>
  );
}
```

- [ ] **Step 8: Build the post list and edit pages**

Create `src/app/admin/posts/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/lib/db';
import { PostForm } from '@/components/admin/PostForm';

export const dynamic = 'force-dynamic';

export default async function AdminPostsPage() {
  const posts = await db.blogPost.findMany({ orderBy: { publishedAt: 'desc' } });

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ash">Write a post</h2>
        <PostForm />
      </section>

      <section>
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ash">
          All posts ({posts.length})
        </h2>
        <ul className="flex flex-col divide-y divide-hairline">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{post.title}</div>
                <div className="font-mono text-xs text-ash">
                  {post.draft ? 'Draft' : 'Published'} ·{' '}
                  {post.publishedAt.toISOString().slice(0, 10)}
                </div>
              </div>
              <Link href={`/admin/posts/${post.id}`} className="text-sm text-gold">
                Edit
              </Link>
            </li>
          ))}
        </ul>
        {posts.length === 0 ? <p className="text-sm text-ash">No posts yet.</p> : null}
      </section>
    </div>
  );
}
```

Create `src/app/admin/posts/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PostForm } from '@/components/admin/PostForm';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { deletePost } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-ash">Edit post</h2>
      <PostForm
        initial={{
          id: post.id,
          title: post.title,
          markdownContent: post.markdownContent,
          draft: post.draft,
        }}
      />
      <DeleteButton id={post.id} action={deletePost} redirectTo="/admin/posts" label="Delete post" />
    </div>
  );
}
```

- [ ] **Step 9: Verify manually**

Run `npm run dev`, go to `/admin/posts`, type a title and some Markdown with a heading, a list, and a link.
Expected: the preview pane updates live and renders styled output. Save and confirm the post lists as "Draft". Stop the server.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add blog admin with markdown editor and live preview"
```

---

## Task 14: Public site shell

**Files:**
- Create: `src/components/site/Header.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `SITE_NAME`, `SITE_TAGLINE`, `NAV_TABS` (Task 1)
- Produces: shared public header with active-tab underline

- [ ] **Step 1: Build the header**

Create `src/components/site/Header.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE_NAME, SITE_TAGLINE, NAV_TABS } from '@/lib/site';

export function Header() {
  const pathname = usePathname();

  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
      <Link href="/stills" className="block">
        <h1 className="text-2xl font-semibold tracking-tight">{SITE_NAME}</h1>
        <p className="mt-0.5 text-sm text-ash">{SITE_TAGLINE}</p>
      </Link>

      <nav className="flex gap-6">
        {NAV_TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative py-2 text-sm uppercase tracking-[0.08em] transition ${
                active ? 'text-gold' : 'text-ash hover:text-gold'
              }`}
            >
              {tab.label}
              {active ? (
                <span className="absolute -bottom-[1.3rem] left-0 h-0.5 w-full bg-gold" />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Create the public layout group**

Create `src/app/(site)/layout.tsx`:

```tsx
import { Header } from '@/components/site/Header';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1300px] px-6 py-10">
      <Header />
      {children}
    </div>
  );
}
```

> The public pages in Tasks 15–18 live under `src/app/(site)/` so they inherit this header. `/admin` and `/login` stay outside the group and keep their own chrome.

- [ ] **Step 3: Verify manually**

Run `npm run dev`, visit `/stills`.
Expected: still a 404 (no page yet) — this task only adds the shell. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/components/site src/app/\(site\)
git commit -m "feat: add public site header and layout"
```

---

## Task 15: Filter bar

**Files:**
- Create: `src/components/site/FilterBar.tsx`
- Create: `src/lib/filters/options.ts`

**Interfaces:**
- Consumes: `MediaFilters`, `parseFilters`, `serializeFilters` (Task 6), `db` (Task 2)
- Produces: `<FilterBar options={FilterOptions} active={MediaFilters} />`, `getPhotoFilterOptions()`, `getVideoFilterOptions()`, `interface FilterOptions { cameras: string[]; locations: string[]; tags: string[] }`

- [ ] **Step 1: Build the option loaders**

Create `src/lib/filters/options.ts`:

```ts
import { db } from '@/lib/db';

export interface FilterOptions {
  cameras: string[];
  locations: string[];
  tags: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function getPhotoFilterOptions(): Promise<FilterOptions> {
  const [photos, tags] = await Promise.all([
    db.photo.findMany({ select: { camera: true, location: true } }),
    db.tag.findMany({ where: { photos: { some: {} } }, select: { name: true } }),
  ]);

  return {
    cameras: unique(photos.map((p) => p.camera)),
    locations: unique(photos.map((p) => p.location)),
    tags: unique(tags.map((t) => t.name)),
  };
}

export async function getVideoFilterOptions(): Promise<FilterOptions> {
  const [videos, tags] = await Promise.all([
    db.video.findMany({ select: { camera: true } }),
    db.tag.findMany({ where: { videos: { some: {} } }, select: { name: true } }),
  ]);

  return {
    cameras: unique(videos.map((v) => v.camera)),
    locations: [],
    tags: unique(tags.map((t) => t.name)),
  };
}
```

- [ ] **Step 2: Build the filter bar**

Create `src/components/site/FilterBar.tsx`:

```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { serializeFilters, type MediaFilters } from '@/lib/filters/parse';
import type { FilterOptions } from '@/lib/filters/options';

interface Props {
  options: FilterOptions;
  active: MediaFilters;
}

type FilterKey = keyof MediaFilters;

const GROUPS: { key: FilterKey; label: string }[] = [
  { key: 'cameras', label: 'Camera' },
  { key: 'locations', label: 'Location' },
  { key: 'tags', label: 'Tag' },
];

export function FilterBar({ options, active }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function toggle(key: FilterKey, value: string) {
    const current = active[key];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];

    const params = serializeFilters({ ...active, [key]: next });
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clear() {
    router.push(pathname, { scroll: false });
  }

  const anyActive =
    active.cameras.length > 0 || active.locations.length > 0 || active.tags.length > 0;

  const visibleGroups = GROUPS.filter((group) => options[group.key].length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded border border-hairline bg-frame/80 px-4 py-3">
      {visibleGroups.map((group) => (
        <div key={group.key} className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-ash">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {options[group.key].map((value) => {
              const on = active[group.key].includes(value);
              return (
                <button
                  key={value}
                  onClick={() => toggle(group.key, value)}
                  aria-pressed={on}
                  className={`rounded border px-2.5 py-1 text-xs transition ${
                    on
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-white/15 text-bone hover:border-white/40'
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {anyActive ? (
        <button onClick={clear} className="ml-auto text-xs text-ash transition hover:text-bone">
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/site/FilterBar.tsx src/lib/filters/options.ts
git commit -m "feat: add URL-driven filter bar"
```

---

## Task 16: Stills page

**Files:**
- Create: `src/app/(site)/stills/page.tsx`
- Create: `src/components/stills/PolaroidWall.tsx`, `src/components/stills/Polaroid.tsx`

**Interfaces:**
- Consumes: `sortPhotosForWall` (Task 4), `parseFilters`/`buildPhotoWhere` (Task 6), `getPhotoFilterOptions`/`FilterBar` (Task 15)
- Produces: the public `/stills` route

**Layout note:** the justified rows come from CSS flex, exactly as the mockup did — each polaroid gets `flex-grow` and `flex-basis` proportional to its aspect ratio, at a fixed row height. No JavaScript layout pass, so the wall renders correctly on first paint and reflows for free.

- [ ] **Step 1: Build the polaroid**

Create `src/components/stills/Polaroid.tsx`:

> ⚠ **Outdated — `photo.filmStock` no longer exists.** Take `settings: PhotoSettings`
> instead and render the caption with `summarizeSettings(toSettings(photo.settings))`
> from `src/lib/photo/settings.ts`, which yields e.g.
> `23mm · f/2 · 1/8 · ISO 640`. See "Status and deviations" at the top.

```tsx
import Image from 'next/image';

export interface PolaroidPhoto {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  location: string;
  camera: string;
  filmStock: string;
}

export function Polaroid({ photo }: { photo: PolaroidPhoto }) {
  const ratio = photo.height > 0 ? photo.width / photo.height : 1;

  return (
    <article
      className="flex h-[380px] flex-col rounded-sm border border-goldline bg-frame p-2.5 pb-3.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)] transition hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.7)]"
      style={{ flexGrow: ratio, flexShrink: 1, flexBasis: `${300 * ratio}px` }}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <Image
          src={photo.imageUrl}
          alt={photo.location}
          fill
          sizes="(max-width: 800px) 100vw, 40vw"
          className="object-cover"
        />
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="text-xs font-bold uppercase tracking-[0.04em]">{photo.location}</div>
        <div className="mt-0.5 font-mono text-[0.65rem] uppercase leading-tight tracking-[0.05em] text-gold">
          {photo.camera} · {photo.filmStock}
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Build the wall**

Create `src/components/stills/PolaroidWall.tsx`:

```tsx
import { Polaroid, type PolaroidPhoto } from './Polaroid';

export function PolaroidWall({ photos }: { photos: PolaroidPhoto[] }) {
  if (photos.length === 0) {
    return <p className="text-sm text-ash">No photos match these filters.</p>;
  }

  return (
    <div className="flex flex-wrap gap-5">
      {photos.map((photo) => (
        <Polaroid key={photo.id} photo={photo} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Configure the remote image host**

Modify `next.config.ts` so `next/image` will serve from R2. Replace `media.example.com` with your actual `R2_PUBLIC_BASE_URL` host:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'media.example.com' }],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Build the page**

Create `src/app/(site)/stills/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { sortPhotosForWall } from '@/lib/color/sort';
import { filtersFromSearchParams } from '@/lib/filters/parse';
import { buildPhotoWhere } from '@/lib/filters/where';
import { getPhotoFilterOptions } from '@/lib/filters/options';
import { FilterBar } from '@/components/site/FilterBar';
import { PolaroidWall } from '@/components/stills/PolaroidWall';

export const dynamic = 'force-dynamic';

export default async function StillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = filtersFromSearchParams(await searchParams);

  const [photos, options] = await Promise.all([
    db.photo.findMany({ where: buildPhotoWhere(filters) }),
    getPhotoFilterOptions(),
  ]);

  return (
    <main>
      <FilterBar options={options} active={filters} />
      <PolaroidWall photos={sortPhotosForWall(photos)} />
    </main>
  );
}
```

- [ ] **Step 5: Verify manually**

Upload at least six photos through `/admin/photos` — include two black-and-white ones and a spread of colors — then visit `/stills`.
Expected: the two black-and-white photos appear first (darker one leading), followed by the color photos sweeping through the hue circle. Clicking a camera chip narrows the wall and puts `?camera=…` in the URL; reloading that URL preserves the filter. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add color-sorted stills wall with filtering"
```

---

## Task 17: Motion page

**Files:**
- Create: `src/app/(site)/motion/page.tsx`
- Create: `src/components/motion/FilmStrip.tsx`, `src/components/motion/FilmFrame.tsx`, `src/components/motion/SpritePreview.tsx`, `src/components/motion/VideoPlayer.tsx`, `src/components/motion/RollIndex.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `parseFilters`/`buildVideoWhere` (Task 6), `getVideoFilterOptions`/`FilterBar` (Task 15)
- Produces: the public `/motion` route

**Animation contract:** the sprite is one wide image inside an `overflow: hidden` box. The image is `width: calc(frames × 100%)`, and a `steps(frames)` keyframe animates `translateX(0)` → `translateX(-100%)`, landing on each frame in turn. Only the active frame runs; every other frame is paused on frame one. `prefers-reduced-motion: reduce` disables it outright.

- [ ] **Step 1: Add the sprite animation CSS**

Append to `src/app/globals.css`:

```css
@keyframes sprite-play {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}

.sprite-window {
  position: relative;
  overflow: hidden;
  background-color: #000;
}

.sprite-strip {
  display: block;
  height: 100%;
  max-width: none;
  animation-name: sprite-play;
  animation-timing-function: steps(var(--sprite-frames, 10));
  animation-duration: 2s;
  animation-iteration-count: infinite;
  animation-play-state: paused;
}

.sprite-window[data-active='true'] .sprite-strip {
  animation-play-state: running;
}

@media (prefers-reduced-motion: reduce) {
  .sprite-strip {
    animation: none !important;
    transform: translateX(0) !important;
  }
}
```

- [ ] **Step 2: Build the sprite preview**

Create `src/components/motion/SpritePreview.tsx`:

```tsx
interface Props {
  spriteUrl: string;
  frames: number;
  active: boolean;
  alt: string;
}

export function SpritePreview({ spriteUrl, frames, active, alt }: Props) {
  return (
    <div
      className="sprite-window aspect-video w-full"
      data-active={active ? 'true' : 'false'}
      style={{ ['--sprite-frames' as string]: String(frames) }}
    >
      {/* Intentionally a plain img: this is one pre-sized sprite strip, and
          next/image would fight the width: frames × 100% sizing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spriteUrl}
        alt={alt}
        loading="lazy"
        className="sprite-strip"
        style={{ width: `${frames * 100}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Build the video player**

Create `src/components/motion/VideoPlayer.tsx`:

```tsx
'use client';

interface Props {
  videoUrl: string;
  posterUrl: string;
  title: string;
}

export function VideoPlayer({ videoUrl, posterUrl, title }: Props) {
  return (
    <video
      src={videoUrl}
      poster={posterUrl}
      title={title}
      controls
      autoPlay
      preload="metadata"
      playsInline
      className="aspect-video w-full bg-black"
    />
  );
}
```

- [ ] **Step 4: Build the film frame**

Create `src/components/motion/FilmFrame.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { SpritePreview } from './SpritePreview';
import { VideoPlayer } from './VideoPlayer';

export interface FrameVideo {
  id: string;
  videoUrl: string;
  posterImageUrl: string;
  spriteUrl: string;
  spriteFrames: number;
  title: string;
  // ⚠ Outdated — camera/format/fps/iso and rollGroup were all dropped from Video.
  // Use `description: string` instead; there is no per-clip metadata overlay and
  // no roll to group by. See "Status and deviations" at the top.
  camera: string;
  format: string;
  fps: string;
  iso: string;
  rollGroup: string;
}

interface Props {
  video: FrameVideo;
  index: number;
  active: boolean;
}

export function FilmFrame({ video, index, active }: Props) {
  const [playing, setPlaying] = useState(false);
  const frameCode = `${String(index + 1).padStart(2, '0')}A`;

  return (
    <article className="mx-auto mb-20 w-[calc(100%-140px)] rounded-sm border border-goldline bg-frame p-3 pb-4 shadow-[0_8px_24px_rgba(0,0,0,0.6)] max-[800px]:w-[calc(100%-40px)]">
      <div className="mb-2 flex justify-between font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-gold">
        <span>▶ {video.rollGroup}</span>
        <span>Frame {frameCode}</span>
      </div>

      {playing ? (
        <VideoPlayer
          videoUrl={video.videoUrl}
          posterUrl={video.posterImageUrl}
          title={video.title}
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="group relative block w-full"
          aria-label={`Play ${video.title}`}
        >
          <SpritePreview
            spriteUrl={video.spriteUrl}
            frames={video.spriteFrames}
            active={active}
            alt={video.title}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-gold/70 bg-ink/60 px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] text-gold opacity-0 transition group-hover:opacity-100">
              Play
            </span>
          </span>
        </button>
      )}

      <div className="mt-2.5 flex items-start justify-between gap-4">
        <div className="text-sm font-bold uppercase tracking-[0.04em]">{video.title}</div>
        <div className="text-right font-mono text-[0.65rem] uppercase leading-tight tracking-[0.05em] text-gold">
          {video.camera} · {video.format}
          <br />
          {video.fps} · ISO {video.iso}
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Build the roll index**

Create `src/components/motion/RollIndex.tsx`:

```tsx
'use client';

interface Props {
  titles: string[];
  activeIndex: number;
  onJump: (index: number) => void;
}

export function RollIndex({ titles, activeIndex, onJump }: Props) {
  return (
    <aside className="flex w-60 flex-col rounded border border-hairline bg-frame/80 p-5 max-[800px]:w-full">
      <div className="mb-3 border-b border-hairline pb-2 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ash">
        Roll index ({titles.length})
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto max-[800px]:flex-row">
        {titles.map((title, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={title + index}
              onClick={() => onJump(index)}
              className={`flex flex-col items-start rounded border px-3 py-2.5 text-left transition ${
                active
                  ? 'border-gold bg-white/10'
                  : 'border-transparent hover:border-white/15 hover:bg-white/5'
              }`}
            >
              <span className="font-mono text-xs font-bold text-gold">
                [{String(index + 1).padStart(2, '0')}A]
              </span>
              <span
                className={`mt-0.5 w-full truncate text-xs ${active ? 'text-bone' : 'text-ash'}`}
              >
                {title}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Build the scroll-driven film strip**

Create `src/components/motion/FilmStrip.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilmFrame, type FrameVideo } from './FilmFrame';
import { RollIndex } from './RollIndex';

const SPROCKET_PITCH = 32;

export function FilmStrip({ videos }: { videos: FrameVideo[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<HTMLDivElement>(null);
  const spoolRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const travel = useCallback(() => {
    const frames = framesRef.current;
    const strip = stripRef.current;
    if (!frames || !strip) return 0;
    return Math.max(1, frames.scrollHeight - strip.clientHeight + 100);
  }, []);

  const maxScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 1;
    return Math.max(1, track.clientHeight - window.innerHeight);
  }, []);

  useEffect(() => {
    function onScroll() {
      const track = trackRef.current;
      const frames = framesRef.current;
      const strip = stripRef.current;
      if (!track || !frames || !strip) return;

      const progressed = window.scrollY - track.offsetTop;
      if (progressed < 0) return;

      const ratio = Math.min(Math.max(progressed / maxScroll(), 0), 1);
      const offset = -(ratio * travel());

      frames.style.transform = `translateY(${offset}px)`;

      const sprocket = offset % SPROCKET_PITCH;
      strip.style.backgroundPosition = `18px ${sprocket}px, calc(100% - 18px) ${sprocket}px`;

      if (spoolRef.current) {
        spoolRef.current.style.transform = `rotate(${ratio * 1080}deg)`;
      }

      const children = Array.from(frames.children) as HTMLElement[];
      const position = Math.abs(offset);
      let next = 0;
      children.forEach((child, index) => {
        if (position >= child.offsetTop - 140) next = index;
      });
      setActiveIndex(next);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [maxScroll, travel]);

  function jumpToFrame(index: number) {
    const track = trackRef.current;
    const frames = framesRef.current;
    if (!track || !frames) return;
    const child = frames.children[index] as HTMLElement | undefined;
    if (!child) return;

    const ratio = Math.min(Math.max(child.offsetTop / travel(), 0), 1);
    window.scrollTo({ top: track.offsetTop + ratio * maxScroll(), behavior: 'smooth' });
  }

  if (videos.length === 0) {
    return <p className="text-sm text-ash">No videos match these filters.</p>;
  }

  return (
    <div ref={trackRef} className="relative" style={{ height: `${videos.length * 200}vh` }}>
      <div className="sticky top-5 flex h-[85vh] w-full gap-6 max-[800px]:h-auto max-[800px]:flex-col">
        <div className="flex h-full flex-1 flex-col overflow-hidden">
          <div className="mb-3 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.1em] text-gold">
            <div ref={spoolRef} className="relative h-6 w-6 rounded-full border-2 border-gold">
              <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-gold" />
              <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-gold" />
            </div>
            <span>Transport mechanism</span>
          </div>

          <div
            ref={stripRef}
            className="relative h-full w-full overflow-hidden rounded border border-hairline bg-film shadow-[0_20px_50px_rgba(0,0,0,0.9)]"
            style={{
              backgroundImage:
                'radial-gradient(circle, var(--color-ink) 40%, transparent 45%), radial-gradient(circle, var(--color-ink) 40%, transparent 45%)',
              backgroundPosition: '18px 0px, calc(100% - 18px) 0px',
              backgroundSize: '20px 32px',
              backgroundRepeat: 'repeat-y',
            }}
          >
            <div ref={framesRef} className="absolute inset-x-0 top-0 pt-10 will-change-transform">
              {videos.map((video, index) => (
                <FilmFrame
                  key={video.id}
                  video={video}
                  index={index}
                  active={index === activeIndex}
                />
              ))}
            </div>
          </div>
        </div>

        <RollIndex
          titles={videos.map((video) => video.title)}
          activeIndex={activeIndex}
          onJump={jumpToFrame}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build the page**

Create `src/app/(site)/motion/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { filtersFromSearchParams } from '@/lib/filters/parse';
import { buildVideoWhere } from '@/lib/filters/where';
import { getVideoFilterOptions } from '@/lib/filters/options';
import { FilterBar } from '@/components/site/FilterBar';
import { FilmStrip } from '@/components/motion/FilmStrip';

export const dynamic = 'force-dynamic';

export default async function MotionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = filtersFromSearchParams(await searchParams);

  const [videos, options] = await Promise.all([
    db.video.findMany({
      // ⚠ Outdated — no rollGroup. Order by { sortOrder: 'asc' } alone; the wall
      // is one flat, drag-ordered list. See "Status and deviations" at the top.
      where: buildVideoWhere(filters),
      orderBy: [{ rollGroup: 'asc' }, { sortOrder: 'asc' }],
    }),
    getVideoFilterOptions(),
  ]);

  return (
    <main>
      <FilterBar options={options} active={filters} />
      <FilmStrip videos={videos} />
    </main>
  );
}
```

- [ ] **Step 8: Verify manually**

Upload at least three videos, then visit `/motion` and scroll slowly.
Expected: the strip unwinds, the spool rotates, sprocket holes scroll, the roll index highlights the current frame, and **only the centered frame animates** — the others hold on a still. Clicking a frame swaps in a real `<video>` and starts playback. Then enable "reduce motion" in your OS settings, reload, and confirm no frame animates. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add motion film strip with animated sprite previews"
```

---

## Task 18: Journal pages

**Files:**
- Create: `src/app/(site)/journal/page.tsx`, `src/app/(site)/journal/[slug]/page.tsx`
- Create: `src/lib/excerpt.ts`
- Test: `tests/unit/excerpt.test.ts`

**Interfaces:**
- Consumes: `db` (Task 2), `.prose-portfolio` styles (Task 13)
- Produces: `buildExcerpt(markdown: string, maxLength?: number): string`, public `/journal` and `/journal/[slug]` routes

- [ ] **Step 1: Write the failing excerpt tests**

Create `tests/unit/excerpt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildExcerpt } from '@/lib/excerpt';

describe('buildExcerpt', () => {
  it('strips heading markers', () => {
    expect(buildExcerpt('# Title\n\nBody text here.')).toBe('Title Body text here.');
  });

  it('strips emphasis markers', () => {
    expect(buildExcerpt('Some **bold** and _italic_ text.')).toBe('Some bold and italic text.');
  });

  it('replaces links with their text', () => {
    expect(buildExcerpt('See [the docs](https://example.com) now.')).toBe('See the docs now.');
  });

  it('removes image embeds entirely', () => {
    expect(buildExcerpt('![alt](https://example.com/a.png) Caption.')).toBe('Caption.');
  });

  it('collapses whitespace', () => {
    expect(buildExcerpt('a\n\n\nb   c')).toBe('a b c');
  });

  it('truncates with an ellipsis past the limit', () => {
    const result = buildExcerpt('x'.repeat(200), 20);
    expect(result).toHaveLength(21);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves short text untruncated', () => {
    expect(buildExcerpt('Short.', 20)).toBe('Short.');
  });

  it('returns an empty string for empty input', () => {
    expect(buildExcerpt('')).toBe('');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- excerpt`
Expected: FAIL — cannot resolve `@/lib/excerpt`.

- [ ] **Step 3: Implement**

Create `src/lib/excerpt.ts`:

```ts
export function buildExcerpt(markdown: string, maxLength = 180): string {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- excerpt`
Expected: PASS (8 tests).

- [ ] **Step 5: Build the journal list**

Create `src/app/(site)/journal/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/lib/db';
import { buildExcerpt } from '@/lib/excerpt';

export const dynamic = 'force-dynamic';

export default async function JournalPage() {
  const posts = await db.blogPost.findMany({
    where: { draft: false },
    orderBy: { publishedAt: 'desc' },
  });

  if (posts.length === 0) {
    return (
      <main>
        <p className="text-sm text-ash">No posts published yet.</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl">
      <ul className="flex flex-col divide-y divide-hairline">
        {posts.map((post) => (
          <li key={post.id} className="py-6">
            <Link href={`/journal/${post.slug}`} className="group block">
              <time className="font-mono text-xs uppercase tracking-[0.1em] text-gold">
                {post.publishedAt.toISOString().slice(0, 10)}
              </time>
              <h2 className="mt-1 text-xl transition group-hover:text-gold">{post.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ash">
                {buildExcerpt(post.markdownContent)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Build the post page**

Create `src/app/(site)/journal/[slug]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await db.blogPost.findUnique({ where: { slug } });
  return { title: post?.title ?? 'Journal' };
}

export default async function JournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await db.blogPost.findUnique({ where: { slug } });
  if (!post || post.draft) notFound();

  return (
    <main className="max-w-2xl">
      <Link href="/journal" className="font-mono text-xs uppercase tracking-[0.1em] text-ash transition hover:text-gold">
        ← Journal
      </Link>

      <article className="mt-6">
        <time className="font-mono text-xs uppercase tracking-[0.1em] text-gold">
          {post.publishedAt.toISOString().slice(0, 10)}
        </time>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{post.title}</h1>
        <div className="prose-portfolio mt-8">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.markdownContent}</ReactMarkdown>
        </div>
      </article>
    </main>
  );
}
```

- [ ] **Step 7: Verify manually**

Publish a post (uncheck "Keep as draft") in `/admin/posts`, then visit `/journal`.
Expected: the post lists with a plain-text excerpt; clicking through renders styled Markdown. A post still marked as draft must **not** appear in the list, and visiting its slug directly must 404. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add public journal list and post pages"
```

---

## Task 19: End-to-end smoke tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/admin.spec.ts`, `tests/e2e/public.spec.ts`

**Interfaces:**
- Consumes: the running app from all prior tasks
- Produces: `npm run test:e2e`

- [ ] **Step 1: Install the Playwright browser**

```bash
npx playwright install chromium
```

- [ ] **Step 2: Configure Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/stills',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write the admin login smoke test**

Create `tests/e2e/admin.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

test.skip(!PASSWORD, 'Set E2E_ADMIN_PASSWORD to run admin tests');

test('unauthenticated visitors are redirected to login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByPlaceholder('Password')).toBeVisible();
});

test('a wrong password is rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Password').fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That password is incorrect')).toBeVisible();
});

test('the correct password opens the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('link', { name: 'Photos' })).toBeVisible();
});

test('the photo form is reachable and rejects an empty submit', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.goto('/admin/photos');
  await page.getByRole('button', { name: 'Save photo' }).click();
  await expect(page.getByText('Upload an image before saving')).toBeVisible();
});
```

- [ ] **Step 4: Write the public smoke test**

Create `tests/e2e/public.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('the root redirects to stills', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/stills/);
});

test('every public tab is reachable', async ({ page }) => {
  await page.goto('/stills');
  await page.getByRole('link', { name: 'Motion' }).click();
  await expect(page).toHaveURL(/\/motion/);

  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page).toHaveURL(/\/journal/);

  await page.getByRole('link', { name: 'Stills' }).click();
  await expect(page).toHaveURL(/\/stills/);
});

test('the admin area is not linked from the public site', async ({ page }) => {
  await page.goto('/stills');
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
});
```

- [ ] **Step 5: Run the suites**

```bash
E2E_ADMIN_PASSWORD="your-chosen-password" npm run test:e2e
```

On Windows PowerShell:

```powershell
$env:E2E_ADMIN_PASSWORD="your-chosen-password"; npm run test:e2e
```

Expected: all tests pass. Without the env var, the four admin tests skip and the three public tests still run.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS — all unit tests across colors, sorting, timestamps, filters, storage, auth, tags, slugs, and excerpts.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add Playwright smoke tests for auth and public navigation"
```

---

## Deployment checklist (after Task 19)

- [ ] Push the repository to GitHub.
- [ ] Import the repo into Vercel; it auto-detects Next.js.
- [ ] Add all eight environment variables from `.env.example` to the Vercel project (Production and Preview).
- [ ] Update `next.config.ts` `remotePatterns` to the real R2 public hostname if you have not already.
- [ ] Configure the R2 bucket for public read access on the custom domain, and set a CORS rule allowing `PUT` from your Vercel domain — browser uploads fail without it.
- [ ] Deploy, then sign in at `/login` on the live domain and upload one photo end to end.
- [ ] Confirm at vercel.com/pricing that the Hobby tier still covers this usage, and that the site remains non-commercial.

---

## Self-review notes

**Spec coverage:** every spec section maps to a task — stack (1, 2), data model (2), Stills page (16), Motion page (17), Journal (18), color-sort algorithm (3, 4, 16), admin area (10–13), media pipeline (7, 8, 12), animated frame previews (5, 12, 17), error handling (7, 9, 11–13), testing (3–6, 8, 9, 11, 13, 18, 19).

**Two deliberate deviations from the spec, both noted inline where they occur:**
1. `Photo.orientation` is replaced by `width`/`height`. The wall needs the real aspect ratio to size each polaroid, and orientation is derivable from it — storing dimensions is strictly more useful.
2. Justified rows are done in CSS flex rather than a JavaScript packing pass, matching how the source mockup actually worked. This removes the "justified-row packing" unit test the spec anticipated; the ordering logic it was protecting is covered by `tests/unit/color/sort.test.ts` instead.

**Known sequencing constraint:** Task 7's upload routes import `requireSession` from Task 9. Implement in numeric order, or Task 7 will not compile on its own.

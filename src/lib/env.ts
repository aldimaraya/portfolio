import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.url(),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

/**
 * Validation is sliced per concern and evaluated lazily, so a partially
 * configured environment only fails where it is actually missing something.
 * Without this, signing in would break purely because R2 wasn't set up yet.
 */
const authSchema = schema.pick({ ADMIN_PASSWORD_HASH: true, SESSION_SECRET: true });
const storageSchema = schema.pick({
  R2_ACCOUNT_ID: true,
  R2_ACCESS_KEY_ID: true,
  R2_SECRET_ACCESS_KEY: true,
  R2_BUCKET: true,
  R2_PUBLIC_BASE_URL: true,
});

/**
 * Kept out of `schema` on purpose: the newsletter is optional, and folding its
 * keys into the full check would make `env()` fail on every environment that
 * never set up email — which is every preview deployment, by design (see
 * "Newsletter" in docs/architecture.md).
 */
const emailSchema = z.object({
  RESEND_API_KEY: z.string().min(1),
  // A display name and address, e.g. `Aldi Maraya <hello@updates.idlabs.me>`.
  // The domain must be one verified in Resend, or every send is refused.
  EMAIL_FROM: z.string().min(1),
});

export type AuthEnv = z.infer<typeof authSchema>;
export type StorageEnv = z.infer<typeof storageSchema>;
export type EmailEnv = z.infer<typeof emailSchema>;

export function parseEmailEnv(source: Record<string, string | undefined>): EmailEnv {
  return emailSchema.parse(source);
}

function memoize<T>(parse: () => T): () => T {
  let cached: T | null = null;
  return () => {
    if (cached === null) cached = parse();
    return cached;
  };
}

/** Server-only. Secrets — never import this from a client component. */
export const authEnv = memoize<AuthEnv>(() => authSchema.parse(process.env));

/** Server-only. R2 credentials. */
export const storageEnv = memoize<StorageEnv>(() => storageSchema.parse(process.env));

/** Server-only. The Resend key — never import this from a client component. */
export const emailEnv = memoize<EmailEnv>(() => parseEmailEnv(process.env));

/** Full validation, for a deliberate all-or-nothing startup check. */
export const env = memoize<Env>(() => parseEnv(process.env));

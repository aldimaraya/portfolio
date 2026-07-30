import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 does not connect on its own — a bare `new PrismaClient()` throws.
// The Neon driver adapter is what gives it a connection.
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

function client(): PrismaClient {
  // Dev-only singleton: without this, hot reload opens a new pool every edit.
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma ??= createClient();
    return globalForPrisma.prisma;
  }
  return (cached ??= createClient());
}

let cached: PrismaClient | undefined;

/**
 * Constructed on first use rather than at import time. Modules like lib/tags.ts
 * mix pure helpers with queries, and importing one of those helpers shouldn't
 * demand a live DATABASE_URL — which is exactly what unit tests do.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = client();
    // Receiver is the instance, not the proxy: Prisma exposes its model
    // delegates (db.photo, db.tag, …) through getters that rely on `this`.
    const value = Reflect.get(instance, property, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

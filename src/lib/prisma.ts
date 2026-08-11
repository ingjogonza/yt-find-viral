import { PrismaClient } from "@prisma/client";

/**
 * Singleton PrismaClient for the Next.js app.
 *
 * scripts/discover.ts intentionally creates its OWN short-lived PrismaClient
 * (it's a standalone one-shot script run via `npx tsx`), so this singleton
 * is only used by the app's Server Components / route handlers. Reusing one
 * instance across module reloads avoids exhausting Postgres connections
 * during `next dev` HMR.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

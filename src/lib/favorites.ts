import { PrismaClient } from "@prisma/client";

/**
 * Read-only data layer for favorites (Prompt 7). The mutation (toggling a
 * favorite) lives separately in src/lib/favorites-actions.ts — a "use
 * server" file may only export Server Actions, so a plain data-read helper
 * like this one can't live there without becoming an unintended public
 * POST-callable endpoint.
 */
export async function getFavoriteChannelIds(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.favoriteChannel.findMany({ select: { channelId: true } });
  return new Set(rows.map((r) => r.channelId));
}

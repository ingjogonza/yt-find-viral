"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";

/**
 * Toggles a channel's favorite status. `wasFavorite` comes bound from the
 * button that rendered the current state (see FavoriteButton), so the
 * action doesn't need a read-before-write.
 *
 * `revalidatePath("/", "layout")` invalidates every route under the root
 * layout in one call — favorite status is shown on every catalog view
 * (main, viral, recientes, shorts, keywords, tracker) plus /favoritos and
 * /dashboard's "solo favoritos" scope, so a single per-path revalidate list
 * would be equivalent but more fragile to keep in sync as views are added.
 */
export async function toggleFavoriteChannel(channelId: string, wasFavorite: boolean): Promise<void> {
  if (wasFavorite) {
    await prisma.favoriteChannel.delete({ where: { channelId } }).catch(() => {
      // Already removed (e.g. a double-click) — nothing to do.
    });
  } else {
    await prisma.favoriteChannel.upsert({
      where: { channelId },
      create: { channelId },
      update: {},
    });
  }
  revalidatePath("/", "layout");
}

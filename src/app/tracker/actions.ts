"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseChannelIdInput, MAX_TRACKED_CHANNELS } from "@/lib/tracker";

export type AddChannelState = {
  error: string | null;
};

/**
 * Adds a channelId (raw or parsed from a /channel/ URL) to the watchlist.
 * Rejects duplicates and enforces MAX_TRACKED_CHANNELS. The count-then-create
 * isn't wrapped in a transaction — fine for a single-user personal tool at a
 * 25-channel cap, not worth the extra complexity here.
 */
export async function addTrackedChannel(
  _prevState: AddChannelState,
  formData: FormData,
): Promise<AddChannelState> {
  const rawInput = String(formData.get("channelIdOrUrl") ?? "");
  const channelId = parseChannelIdInput(rawInput);

  if (!channelId) {
    return {
      error:
        "No reconocí un channelId ahí. Pegá el ID (empieza con UC...) o un link tipo youtube.com/channel/UC...",
    };
  }

  const existing = await prisma.trackedChannel.findUnique({ where: { channelId } });
  if (existing) {
    return { error: "Ese canal ya está en tu lista de seguimiento." };
  }

  const currentCount = await prisma.trackedChannel.count();
  if (currentCount >= MAX_TRACKED_CHANNELS) {
    return {
      error: `Ya tenés ${MAX_TRACKED_CHANNELS} canales en seguimiento (el máximo). Dejá de seguir alguno antes de agregar otro.`,
    };
  }

  await prisma.trackedChannel.create({ data: { channelId } });
  revalidatePath("/tracker");
  return { error: null };
}

/**
 * Stops following a channel. Only deletes the TrackedChannel row — the
 * Channel catalog row and any TrackedVideoSnapshots already captured are
 * left untouched (re-following later picks the history back up).
 */
export async function removeTrackedChannel(channelId: string): Promise<void> {
  await prisma.trackedChannel.delete({ where: { channelId } }).catch(() => {
    // Already removed (e.g. a double-click) — nothing to do.
  });
  revalidatePath("/tracker");
}

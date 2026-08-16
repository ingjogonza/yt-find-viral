import { PrismaClient } from "@prisma/client";

/**
 * Data layer for the `/viral` page ("Viral en canales chicos"). Same
 * "most recent snapshot per channel" query shape as
 * fetchAllChannelsWithLatestSnapshot in src/lib/catalog.ts: select each
 * channel with its single most recent ChannelSnapshot, then filter/shape
 * in application code. Never calls the YouTube API — reads our own DB only.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Small-channel threshold: fewer than this many subscribers. */
const SUBSCRIBER_CEILING = 10_000;

/** "Viral" threshold: the channel's most recent snapshot must show at least
 * this many average recent views. */
const AVG_VIEWS_FLOOR = 100_000;

/** The qualifying snapshot must have been captured within this many days,
 * so a channel that was viral months ago but has since gone quiet doesn't
 * show up as if it were currently blowing up. */
const SNAPSHOT_FRESHNESS_DAYS = 30;

/** How many cards to show per "Sorpréndeme" batch — no pagination on this page. */
export const VIRAL_BATCH_SIZE = 15;

export type ViralChannel = {
  id: string;
  title: string;
  thumbnailUrl: string;
  representativeVideoId: string | null;
  subscriberCount: number;
  avgViewsRecent: number;
  daysSinceStart: number;
  format: string | null;
  quality: string | null;
};

type ChannelWithLatestSnapshot = {
  id: string;
  title: string;
  thumbnailUrl: string;
  representativeVideoThumbnailUrl: string | null;
  representativeVideoId: string | null;
  subscriberCount: number;
  channelPublishedAt: Date;
  format: string | null;
  quality: string | null;
  snapshots: { avgViewsRecent: number; capturedAt: Date }[];
};

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / MS_PER_DAY));
}

/**
 * Loads every channel matching the "viral in a small channel" signal:
 * subscriberCount < SUBSCRIBER_CEILING AND the most recent snapshot has
 * avgViewsRecent > AVG_VIEWS_FLOOR AND that snapshot was captured within
 * SNAPSHOT_FRESHNESS_DAYS. No pagination — callers are expected to
 * shuffle/slice this into one batch (see shuffleSeeded below).
 */
export async function loadViralChannels(prisma: PrismaClient): Promise<ViralChannel[]> {
  const channels: ChannelWithLatestSnapshot[] = await prisma.channel.findMany({
    where: { subscriberCount: { lt: SUBSCRIBER_CEILING } },
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      representativeVideoThumbnailUrl: true,
      representativeVideoId: true,
      subscriberCount: true,
      channelPublishedAt: true,
      format: true,
      quality: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { avgViewsRecent: true, capturedAt: true },
      },
    },
  });

  const freshnessCutoff = new Date(Date.now() - SNAPSHOT_FRESHNESS_DAYS * MS_PER_DAY);

  return channels
    .filter((channel) => {
      const snapshot = channel.snapshots[0];
      if (!snapshot) return false;
      if (snapshot.avgViewsRecent <= AVG_VIEWS_FLOOR) return false;
      if (snapshot.capturedAt < freshnessCutoff) return false;
      return true;
    })
    .map((channel) => ({
      id: channel.id,
      title: channel.title,
      thumbnailUrl: channel.representativeVideoThumbnailUrl ?? channel.thumbnailUrl,
      representativeVideoId: channel.representativeVideoThumbnailUrl ? channel.representativeVideoId : null,
      subscriberCount: channel.subscriberCount,
      avgViewsRecent: channel.snapshots[0].avgViewsRecent,
      daysSinceStart: daysSince(channel.channelPublishedAt),
      format: channel.format,
      quality: channel.quality,
    }));
}

/**
 * Small seeded PRNG (mulberry32) so `?seed=` in the URL deterministically
 * reproduces the same shuffle for a given request — keeps this page a
 * Server Component (the shuffle itself needs no client JS, only the button
 * that picks a new random seed and navigates does).
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates shuffle driven by `seed`. Same seed -> same order. */
export function shuffleSeeded<T>(items: T[], seed: number): T[] {
  const result = [...items];
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

import type { PrismaClient } from "@prisma/client";

/**
 * Shared YouTube Data API v3 fetch helpers + the "fetch a channel's current
 * metadata and upsert it into the Channel table" logic.
 *
 * Used by both scripts/discover.ts (catalog crawler, Prompt 1/3/5) and
 * scripts/track.ts (channel tracker, Prompt 6) so this logic exists in
 * exactly one place instead of being duplicated across the two scripts.
 */

export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/** YouTube Data API v3 batching limit for id-based list endpoints. */
export const YOUTUBE_ID_BATCH_SIZE = 50;

export type YouTubeThumbnails = {
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
};

export type ChannelMeta = {
  id: string;
  title: string;
  description: string;
  country: string | null;
  defaultLanguage: string | null;
  subscriberCount: number;
  totalViews: bigint;
  videoCount: number;
  channelPublishedAt: Date;
  thumbnailUrl: string;
  uploadsPlaylistId: string | null;
};

type YouTubeChannelListResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      country?: string;
      defaultLanguage?: string;
      publishedAt?: string;
      thumbnails?: YouTubeThumbnails;
    };
    statistics?: {
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      viewCount?: string;
      videoCount?: string;
    };
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
};

type YouTubePlaylistItemsResponse = {
  items?: Array<{
    contentDetails?: { videoId?: string };
  }>;
};

// ---------------------------------------------------------------------------
// Small generic helpers
// ---------------------------------------------------------------------------

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function pickThumbnailUrl(thumbnails: YouTubeThumbnails | undefined): string {
  return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? "";
}

// ---------------------------------------------------------------------------
// YouTube API calls
// ---------------------------------------------------------------------------

export async function youtubeGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    throw new Error(
      `YouTube API request failed: ${response.status} ${response.statusText} for ${path} — ${body}`,
    );
  }
  return (await response.json()) as T;
}

/** channels.list for up to YOUTUBE_ID_BATCH_SIZE channel ids at a time. */
export async function fetchChannelsMeta(channelIds: string[], apiKey: string): Promise<ChannelMeta[]> {
  const data = await youtubeGet<YouTubeChannelListResponse>(
    "channels",
    {
      part: "snippet,statistics,contentDetails",
      id: channelIds.join(","),
    },
    apiKey,
  );

  return (data.items ?? []).map((item) => {
    const snippet = item.snippet ?? {};
    const statistics = item.statistics ?? {};
    return {
      id: item.id,
      title: snippet.title ?? "",
      description: snippet.description ?? "",
      country: snippet.country ?? null,
      defaultLanguage: snippet.defaultLanguage ?? null,
      subscriberCount: statistics.hiddenSubscriberCount
        ? 0
        : Number(statistics.subscriberCount ?? 0),
      totalViews: BigInt(statistics.viewCount ?? "0"),
      videoCount: Number(statistics.videoCount ?? 0),
      channelPublishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : new Date(0),
      thumbnailUrl: pickThumbnailUrl(snippet.thumbnails),
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
    };
  });
}

/** playlistItems.list for a channel's uploads playlist — last `maxResults` video ids. */
export async function fetchRecentUploadVideoIds(
  uploadsPlaylistId: string,
  apiKey: string,
  maxResults: number,
): Promise<string[]> {
  const data = await youtubeGet<YouTubePlaylistItemsResponse>(
    "playlistItems",
    {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(maxResults),
    },
    apiKey,
  );

  const videoIds: string[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.contentDetails?.videoId;
    if (videoId) videoIds.push(videoId);
  }
  return videoIds;
}

// ---------------------------------------------------------------------------
// Channel upsert
// ---------------------------------------------------------------------------

/**
 * Fields beyond plain channel metadata that scripts/discover.ts derives from
 * a channel's sampled uploads (classification-adjacent/shorts/tags stats).
 * Optional so callers that only have a `ChannelMeta` (e.g. scripts/track.ts)
 * can upsert without touching these — an omitted field is left untouched by
 * Prisma on `update`, and stays at its schema default/null on `create`.
 */
export type ChannelUpsertExtras = {
  representativeVideoThumbnailUrl?: string;
  madeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  dominantCategoryId?: string;
  totalShortsInSample?: number;
  totalLongInSample?: number;
  avgShortsViews?: number;
  medianShortsViews?: number;
  hasShorts?: boolean;
  tags?: string[];
};

/** Upserts a Channel row from already-fetched metadata (+ optional derived-stats extras). */
export async function upsertChannel(
  prisma: PrismaClient,
  meta: ChannelMeta,
  extras: ChannelUpsertExtras = {},
): Promise<void> {
  const fields = {
    title: meta.title,
    description: meta.description,
    country: meta.country,
    defaultLanguage: meta.defaultLanguage,
    subscriberCount: meta.subscriberCount,
    totalViews: meta.totalViews,
    videoCount: meta.videoCount,
    channelPublishedAt: meta.channelPublishedAt,
    thumbnailUrl: meta.thumbnailUrl,
    lastRefreshedAt: new Date(),
    ...extras,
  };

  await prisma.channel.upsert({
    where: { id: meta.id },
    create: { id: meta.id, ...fields },
    update: fields,
  });
}

/**
 * Fetches a single channel's current metadata from the YouTube Data API
 * (channels.list, 1 quota unit) and upserts it into the Channel table. This
 * is the "traer canal por ID y hacer upsert" logic shared by discover.ts
 * (per already-batched metadata) and track.ts (per single tracked channel).
 *
 * Returns undefined if the id doesn't resolve to a real channel (deleted,
 * private, or simply mistyped) — callers decide how to handle that.
 */
export async function upsertChannelById(
  prisma: PrismaClient,
  channelId: string,
  apiKey: string,
): Promise<{ meta: ChannelMeta; isNew: boolean } | undefined> {
  const [meta] = await fetchChannelsMeta([channelId], apiKey);
  if (!meta) return undefined;

  const existing = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
  await upsertChannel(prisma, meta);
  return { meta, isNew: !existing };
}

/**
 * Channel tracker script (Prompt 6).
 *
 * For every TrackedChannel the user has added (see /tracker), refreshes the
 * Channel row's metadata when it's missing or stale, then always pulls the
 * channel's most recent uploads (contentDetails.relatedPlaylists.uploads +
 * playlistItems.list, same pattern as scripts/discover.ts) and records a
 * fresh TrackedVideoSnapshot per video with its CURRENT view count. Repeated
 * runs build up a time series per video, which src/lib/tracker.ts turns into
 * "view velocity" and "evergreen" signals.
 *
 * Run directly with: npx tsx scripts/track.ts
 *
 * Designed to run unattended on a schedule (see .github/workflows/track.yml).
 * Respects a YouTube Data API v3 quota budget (MAX_QUOTA_UNITS_PER_RUN),
 * same stop-cleanly-on-budget-reached convention as discover.ts. With
 * MAX_TRACKED_CHANNELS capping the watchlist at 25 channels, this script's
 * real quota usage is small and should never come close to that budget —
 * see the printed summary for the actual units spent per run.
 */

import { PrismaClient } from "@prisma/client";
import {
  chunk,
  fetchChannelsMeta,
  fetchRecentUploadVideoIds,
  pickThumbnailUrl,
  upsertChannelById,
  youtubeGet,
  YOUTUBE_ID_BATCH_SIZE,
  type ChannelMeta,
  type YouTubeThumbnails,
} from "../src/lib/channels";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Hard ceiling on estimated YouTube Data API v3 quota units spent per run — a
 * safety net, not a real-world target (see file header). */
export const MAX_QUOTA_UNITS_PER_RUN = 500;

/** How many of a tracked channel's most recent uploads to snapshot per run. */
const TRACKED_UPLOADS_SAMPLE_SIZE = 20;

/** Re-refresh a tracked channel's Channel row metadata (subs, thumbnail, ...)
 * after this many hours. Much shorter than discover.ts's 7-day window since
 * this script itself runs every 3 hours — the uploads/view-count snapshot
 * below always happens regardless of this staleness check. */
const CHANNEL_META_STALE_AFTER_HOURS = 24;

// Quota costs, per the official YouTube Data API v3 quota calculator — the
// id-based list endpoints (channels, playlistItems, videos) all cost 1 unit
// per call regardless of batch size.
const QUOTA_COST_LIST_CALL = 1;

// ---------------------------------------------------------------------------
// Types for the slice of the YouTube API responses this script uses
// ---------------------------------------------------------------------------

type YouTubeVideosListResponse = {
  items?: Array<{
    id: string;
    snippet?: { title?: string; publishedAt?: string; thumbnails?: YouTubeThumbnails };
    statistics?: { viewCount?: string };
  }>;
};

type TrackedVideoDetail = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: Date;
  viewCount: number;
};

// ---------------------------------------------------------------------------
// Quota tracking (same shape as scripts/discover.ts's QuotaTracker)
// ---------------------------------------------------------------------------

class QuotaTracker {
  private unitsUsed = 0;
  public exceeded = false;

  constructor(private readonly maxUnits: number) {}

  get used(): number {
    return this.unitsUsed;
  }

  trySpend(units: number): boolean {
    if (this.unitsUsed + units > this.maxUnits) {
      this.exceeded = true;
      return false;
    }
    this.unitsUsed += units;
    return true;
  }
}

// ---------------------------------------------------------------------------
// YouTube API calls specific to tracking
// ---------------------------------------------------------------------------

/**
 * videos.list (batched) — current title/thumbnail/publishedAt/viewCount for
 * each sampled upload. Distinct from discover.ts's fetchVideoDetails: that
 * one also pulls status/contentDetails for classification-adjacent stats we
 * don't need here, and doesn't request snippet.title/publishedAt, which
 * TrackedVideoSnapshot requires.
 */
async function fetchTrackedVideoDetails(videoIds: string[], apiKey: string): Promise<TrackedVideoDetail[]> {
  const details: TrackedVideoDetail[] = [];
  for (const batch of chunk(videoIds, YOUTUBE_ID_BATCH_SIZE)) {
    const data = await youtubeGet<YouTubeVideosListResponse>(
      "videos",
      {
        part: "snippet,statistics",
        id: batch.join(","),
      },
      apiKey,
    );
    for (const item of data.items ?? []) {
      details.push({
        videoId: item.id,
        title: item.snippet?.title ?? "",
        thumbnailUrl: pickThumbnailUrl(item.snippet?.thumbnails),
        publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : new Date(0),
        viewCount: Number(item.statistics?.viewCount ?? 0),
      });
    }
  }
  return details;
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

type RunSummary = {
  channelsTracked: number;
  channelMetaRefreshed: number;
  channelsSkippedNoUploads: number;
  channelsSkippedNotFound: number;
  snapshotsInserted: number;
  quotaUsed: number;
  quotaExceeded: boolean;
};

async function run(prisma: PrismaClient): Promise<RunSummary> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable: YOUTUBE_API_KEY");
  }

  const quota = new QuotaTracker(MAX_QUOTA_UNITS_PER_RUN);
  const staleCutoff = new Date(Date.now() - CHANNEL_META_STALE_AFTER_HOURS * 60 * 60 * 1000);

  const trackedChannels = await prisma.trackedChannel.findMany({ orderBy: { addedAt: "asc" } });

  let channelMetaRefreshed = 0;
  let channelsSkippedNoUploads = 0;
  let channelsSkippedNotFound = 0;
  let snapshotsInserted = 0;

  for (const tracked of trackedChannels) {
    if (!quota.trySpend(QUOTA_COST_LIST_CALL)) break;

    // --- Step 2: refresh the Channel row's metadata when missing/stale;
    //     otherwise a plain (non-writing) fetch, since we always need
    //     contentDetails.relatedPlaylists.uploads for step 3 below. ---
    const existingChannel = await prisma.channel.findUnique({
      where: { id: tracked.channelId },
      select: { lastRefreshedAt: true },
    });
    const needsMetaRefresh = !existingChannel || existingChannel.lastRefreshedAt < staleCutoff;

    let meta: ChannelMeta | undefined;
    if (needsMetaRefresh) {
      const result = await upsertChannelById(prisma, tracked.channelId, apiKey);
      meta = result?.meta;
      if (meta) channelMetaRefreshed++;
    } else {
      [meta] = await fetchChannelsMeta([tracked.channelId], apiKey);
    }

    if (!meta) {
      channelsSkippedNotFound++;
      continue;
    }
    if (!meta.uploadsPlaylistId) {
      channelsSkippedNoUploads++;
      continue;
    }

    // --- Step 3: last N uploads + their current view counts ---
    if (!quota.trySpend(QUOTA_COST_LIST_CALL)) break;
    const videoIds = await fetchRecentUploadVideoIds(
      meta.uploadsPlaylistId,
      apiKey,
      TRACKED_UPLOADS_SAMPLE_SIZE,
    );

    if (videoIds.length === 0) {
      channelsSkippedNoUploads++;
      continue;
    }

    if (!quota.trySpend(QUOTA_COST_LIST_CALL)) break;
    const videoDetails = await fetchTrackedVideoDetails(videoIds, apiKey);

    // --- Step 4: one TrackedVideoSnapshot per video, capturing this run's viewCount ---
    if (videoDetails.length > 0) {
      await prisma.trackedVideoSnapshot.createMany({
        data: videoDetails.map((detail) => ({
          channelId: tracked.channelId,
          videoId: detail.videoId,
          title: detail.title,
          thumbnailUrl: detail.thumbnailUrl,
          publishedAt: detail.publishedAt,
          viewCount: detail.viewCount,
        })),
      });
      snapshotsInserted += videoDetails.length;
    }
  }

  return {
    channelsTracked: trackedChannels.length,
    channelMetaRefreshed,
    channelsSkippedNoUploads,
    channelsSkippedNotFound,
    snapshotsInserted,
    quotaUsed: quota.used,
    quotaExceeded: quota.exceeded,
  };
}

function printSummary(summary: RunSummary): void {
  console.log("=== Channel tracker run summary ===");
  console.log(`Tracked channels:          ${summary.channelsTracked}`);
  console.log(`Channel metadata refreshed:${summary.channelMetaRefreshed}`);
  console.log(`Skipped (not found):       ${summary.channelsSkippedNotFound}`);
  console.log(`Skipped (no uploads):      ${summary.channelsSkippedNoUploads}`);
  console.log(`Video snapshots inserted:  ${summary.snapshotsInserted}`);
  console.log(`Estimated quota used:      ${summary.quotaUsed} / ${MAX_QUOTA_UNITS_PER_RUN} units`);
  console.log(
    summary.quotaExceeded
      ? "Quota budget reached — stopped early (expected behavior, not an error)."
      : "Run completed within quota budget.",
  );
  console.log("====================================");
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const summary = await run(prisma);
    printSummary(summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Tracker run failed with an unexpected error:");
  console.error(error);
  process.exit(1);
});

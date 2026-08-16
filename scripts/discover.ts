/**
 * Discovery / ingestion script.
 *
 * Rotates through a subset of seed queries (src/lib/seed-queries.ts), searches
 * YouTube for recently-popular videos on each seed, resolves the channels
 * behind those videos, pulls each channel's recent uploads, and stores/updates
 * the channel + a fresh ChannelSnapshot in Postgres via Prisma.
 *
 * Run directly with: npx tsx scripts/discover.ts
 *
 * Designed to run unattended on a schedule (see .github/workflows/discover.yml).
 * Respects a YouTube Data API v3 quota budget (MAX_QUOTA_UNITS_PER_RUN) and
 * stops cleanly (exit code 0) once that budget would be exceeded — running out
 * of quota mid-run is expected/normal, not a failure. Only genuinely
 * unexpected errors (network failures, bad API responses, DB errors, missing
 * config) cause a non-zero exit so GitHub Actions flags the run as failed.
 */

import { PrismaClient } from "@prisma/client";
import { SEED_QUERIES } from "../src/lib/seed-queries";
import {
  chunk,
  fetchChannelsMeta,
  fetchRecentUploadVideoIds,
  pickThumbnailUrl,
  upsertChannel,
  youtubeGet,
  YOUTUBE_ID_BATCH_SIZE,
  type YouTubeThumbnails,
} from "../src/lib/channels";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Hard ceiling on estimated YouTube Data API v3 quota units spent per run. */
export const MAX_QUOTA_UNITS_PER_RUN = 2500;

/** How many seeds to pull from SEED_QUERIES on a single run. */
const SEEDS_PER_RUN = 6;

/** Re-refresh channels whose lastRefreshedAt is older than this many days. */
const REFRESH_STALE_AFTER_DAYS = 7;

/** How far back search.list looks for "recently popular" videos. */
const SEARCH_PUBLISHED_AFTER_DAYS = 90;

/** How many recent uploads per channel to use for avg/median view calculations. */
const RECENT_UPLOADS_SAMPLE_SIZE = 15;

/** A sampled video with contentDetails.duration <= this many seconds counts as a "short". */
const SHORT_MAX_DURATION_SECONDS = 180;

/** Cap on how many distinct tags we store per channel (see collectChannelTags). */
const MAX_TAGS_PER_CHANNEL = 20;

/** search.list maxResults per seed query. */
const SEARCH_RESULTS_PER_SEED = 25;

// Quota costs, per the official YouTube Data API v3 quota calculator.
// search.list is the expensive one; the id-based list endpoints (channels,
// playlistItems, videos) cost 1 unit per call regardless of batch size.
const QUOTA_COST_SEARCH_LIST = 100;
const QUOTA_COST_LIST_CALL = 1;

// ---------------------------------------------------------------------------
// Types for the slice of the YouTube API responses we actually use
// ---------------------------------------------------------------------------

type YouTubeSearchListResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { channelId?: string };
  }>;
};

type YouTubeVideosListResponse = {
  items?: Array<{
    id: string;
    snippet?: { thumbnails?: YouTubeThumbnails; categoryId?: string; tags?: string[] };
    statistics?: { viewCount?: string };
    status?: { madeForKids?: boolean; containsSyntheticMedia?: boolean };
    contentDetails?: { duration?: string };
  }>;
};

/**
 * Per-video data pulled from the SAME videos.list call already used for
 * avgViewsRecent/medianViewsRecent (part=snippet,statistics,status,contentDetails
 * — no extra API call, just extra parts on the existing request).
 */
type VideoDetail = {
  videoId: string;
  viewCount: number;
  thumbnailUrl: string;
  madeForKids: boolean | undefined;
  containsSyntheticMedia: boolean | undefined;
  categoryId: string | undefined;
  durationSeconds: number | undefined;
  tags: string[];
};

// ---------------------------------------------------------------------------
// Quota tracking
// ---------------------------------------------------------------------------

class QuotaTracker {
  private unitsUsed = 0;
  public exceeded = false;

  constructor(private readonly maxUnits: number) {}

  get used(): number {
    return this.unitsUsed;
  }

  /**
   * Attempts to reserve `units` of quota. Returns true and reserves the
   * units if the budget allows it; otherwise marks the run as exceeded and
   * returns false without spending anything.
   */
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
// Small helpers
// ---------------------------------------------------------------------------

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86_400_000);
}

/**
 * Picks a rotating subset of `count` seeds from `seeds`, offset by the
 * current day-of-year so consecutive runs don't always hit the same seeds.
 */
export function pickRotatingSeeds(seeds: string[], date: Date, count: number): string[] {
  if (seeds.length === 0) return [];
  const offset = dayOfYear(date) % seeds.length;
  const rotated = [...seeds.slice(offset), ...seeds.slice(0, offset)];
  return rotated.slice(0, Math.min(count, rotated.length));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const ISO_8601_DURATION_PATTERN = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/**
 * Parses a YouTube contentDetails.duration ISO 8601 string (e.g. "PT45S",
 * "PT4M13S", "PT1H2M10S") into total seconds. Returns undefined for an
 * empty/unrecognized string rather than throwing — duration is best-effort
 * metadata, not something that should fail the whole run.
 */
function parseIso8601DurationSeconds(duration: string | undefined): number | undefined {
  if (!duration) return undefined;
  const match = ISO_8601_DURATION_PATTERN.exec(duration);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

// ---------------------------------------------------------------------------
// YouTube API calls specific to discovery
// ---------------------------------------------------------------------------

/** search.list for one seed query. Returns unique channelIds found. */
async function searchChannelIdsForSeed(seed: string, apiKey: string): Promise<string[]> {
  const publishedAfter = new Date(
    Date.now() - SEARCH_PUBLISHED_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const data = await youtubeGet<YouTubeSearchListResponse>(
    "search",
    {
      part: "snippet",
      type: "video",
      order: "viewCount",
      maxResults: String(SEARCH_RESULTS_PER_SEED),
      publishedAfter,
      q: seed,
    },
    apiKey,
  );

  const channelIds = new Set<string>();
  for (const item of data.items ?? []) {
    const channelId = item.snippet?.channelId;
    if (channelId) channelIds.add(channelId);
  }
  return [...channelIds];
}

/**
 * videos.list (batched) — for each sampled video: view count (for
 * avgViewsRecent/medianViewsRecent), thumbnail (for
 * representativeVideoThumbnailUrl), and the two status flags used for
 * madeForKids/containsSyntheticMedia. Requesting part=snippet,statistics,status
 * is still ONE call per batch (YouTube quota cost is per-request, not
 * per-part) — no extra quota spent versus the statistics-only version.
 */
async function fetchVideoDetails(videoIds: string[], apiKey: string): Promise<VideoDetail[]> {
  const details: VideoDetail[] = [];
  for (const batch of chunk(videoIds, YOUTUBE_ID_BATCH_SIZE)) {
    const data = await youtubeGet<YouTubeVideosListResponse>(
      "videos",
      {
        part: "snippet,statistics,status,contentDetails",
        id: batch.join(","),
      },
      apiKey,
    );
    for (const item of data.items ?? []) {
      details.push({
        videoId: item.id,
        viewCount: Number(item.statistics?.viewCount ?? 0),
        thumbnailUrl: pickThumbnailUrl(item.snippet?.thumbnails),
        madeForKids: item.status?.madeForKids,
        containsSyntheticMedia: item.status?.containsSyntheticMedia,
        categoryId: item.snippet?.categoryId,
        durationSeconds: parseIso8601DurationSeconds(item.contentDetails?.duration),
        tags: item.snippet?.tags ?? [],
      });
    }
  }
  return details;
}

/**
 * true if a STRICT MAJORITY (> half) of the sampled videos have `flag` set
 * to true. Missing/undefined values count as false (not as true), per the
 * spec's "no defaults" rule for these two API-sourced fields. Returns
 * undefined (don't set the DB field) when there are no videos to sample.
 */
function majorityFlag(details: VideoDetail[], flag: "madeForKids" | "containsSyntheticMedia"): boolean | undefined {
  if (details.length === 0) return undefined;
  const trueCount = details.filter((d) => d[flag] === true).length;
  return trueCount > details.length / 2;
}

/** The thumbnail + id of the video with the most views among the sampled ones. */
function pickRepresentativeVideo(
  details: VideoDetail[],
): { thumbnailUrl: string | undefined; videoId: string | undefined } {
  if (details.length === 0) return { thumbnailUrl: undefined, videoId: undefined };
  const mostViewed = details.reduce((best, current) =>
    current.viewCount > best.viewCount ? current : best,
  );
  return { thumbnailUrl: mostViewed.thumbnailUrl || undefined, videoId: mostViewed.videoId };
}

/**
 * The most frequent snippet.categoryId among the sampled videos. Ties are
 * broken by the highest view count among the video(s) carrying each tied
 * category. Videos with no categoryId are ignored; returns undefined when
 * none of the sampled videos carry one.
 */
function pickDominantCategoryId(details: VideoDetail[]): string | undefined {
  const countByCategory = new Map<string, number>();
  const maxViewsByCategory = new Map<string, number>();

  for (const detail of details) {
    if (!detail.categoryId) continue;
    countByCategory.set(detail.categoryId, (countByCategory.get(detail.categoryId) ?? 0) + 1);
    maxViewsByCategory.set(
      detail.categoryId,
      Math.max(maxViewsByCategory.get(detail.categoryId) ?? 0, detail.viewCount),
    );
  }

  let dominantCategoryId: string | undefined;
  let bestCount = -1;
  let bestMaxViews = -1;

  for (const [categoryId, count] of countByCategory) {
    const maxViews = maxViewsByCategory.get(categoryId) ?? 0;
    if (count > bestCount || (count === bestCount && maxViews > bestMaxViews)) {
      dominantCategoryId = categoryId;
      bestCount = count;
      bestMaxViews = maxViews;
    }
  }

  return dominantCategoryId;
}

/** true if a sampled video's duration classifies it as a "short". Videos with
 * an unparseable/missing duration are NOT counted as shorts (undefined !== short). */
function isShortVideo(detail: VideoDetail): boolean {
  return detail.durationSeconds !== undefined && detail.durationSeconds <= SHORT_MAX_DURATION_SECONDS;
}

/**
 * Shorts-vs-long aggregation over the sampled uploads, computed SEPARATELY
 * from avgViewsRecent/medianViewsRecent (which always cover ALL sampled
 * videos regardless of short/long — this function does not touch that).
 * avgShortsViews/medianShortsViews are undefined (not 0) when no sampled
 * video was classified as a short, distinguishing "no shorts sampled" from
 * "shorts sampled with genuinely zero views" — same undefined-means-"don't
 * touch on update" convention as madeForKids/dominantCategoryId above.
 */
function computeShortsStats(details: VideoDetail[]): {
  totalShortsInSample: number;
  totalLongInSample: number;
  avgShortsViews: number | undefined;
  medianShortsViews: number | undefined;
  hasShorts: boolean;
} {
  const shorts = details.filter(isShortVideo);
  const totalShortsInSample = shorts.length;
  const totalLongInSample = details.length - totalShortsInSample;
  const shortsViewCounts = shorts.map((d) => d.viewCount);

  return {
    totalShortsInSample,
    totalLongInSample,
    avgShortsViews: totalShortsInSample > 0 ? average(shortsViewCounts) : undefined,
    medianShortsViews: totalShortsInSample > 0 ? median(shortsViewCounts) : undefined,
    hasShorts: totalShortsInSample > 0,
  };
}

/**
 * Deduplicated union of snippet.tags across all sampled videos for a
 * channel, capped at MAX_TAGS_PER_CHANNEL. Videos with no tags field are
 * skipped gracefully (VideoDetail.tags is already normalized to [] for
 * those — see fetchVideoDetails).
 */
function collectChannelTags(details: VideoDetail[]): string[] {
  const tags = new Set<string>();
  for (const detail of details) {
    for (const tag of detail.tags) {
      tags.add(tag);
      if (tags.size >= MAX_TAGS_PER_CHANNEL) return [...tags];
    }
  }
  return [...tags];
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

type RunSummary = {
  newChannels: number;
  refreshedChannels: number;
  channelsWithNoUploads: number;
  quotaUsed: number;
  quotaExceeded: boolean;
  seedsUsed: string[];
};

async function run(prisma: PrismaClient): Promise<RunSummary> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable: YOUTUBE_API_KEY");
  }

  const quota = new QuotaTracker(MAX_QUOTA_UNITS_PER_RUN);
  const seeds = pickRotatingSeeds(SEED_QUERIES, new Date(), SEEDS_PER_RUN);

  // --- Step 1: search.list per seed -> collect unique candidate channel ids ---
  const candidateChannelIds = new Set<string>();
  for (const seed of seeds) {
    if (!quota.trySpend(QUOTA_COST_SEARCH_LIST)) break;
    const channelIds = await searchChannelIdsForSeed(seed, apiKey);
    channelIds.forEach((id) => candidateChannelIds.add(id));
  }

  // --- Step 2: figure out which candidates are new, stale, or missing
  //     representativeVideoThumbnailUrl/dominantCategoryId (needs refresh) ---
  const candidateIdList = [...candidateChannelIds];
  const existingChannels = candidateIdList.length
    ? await prisma.channel.findMany({
        where: { id: { in: candidateIdList } },
        select: {
          id: true,
          lastRefreshedAt: true,
          representativeVideoThumbnailUrl: true,
          representativeVideoId: true,
          dominantCategoryId: true,
          hasShorts: true,
        },
      })
    : [];
  const existingChannelInfoById = new Map(existingChannels.map((c) => [c.id, c]));

  const staleCutoff = new Date(Date.now() - REFRESH_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const channelIdsToProcess = candidateIdList.filter((id) => {
    const existing = existingChannelInfoById.get(id);
    if (!existing) return true; // new channel
    const isStale = existing.lastRefreshedAt < staleCutoff;
    // Permanent safety net (not a one-time backfill): always re-take a
    // channel whose representativeVideoThumbnailUrl, representativeVideoId,
    // dominantCategoryId, or hasShorts is still null — covers both the
    // Prompt 1 -> Prompt 3/5/9 backfill gaps and any future run where these
    // couldn't be computed (e.g. 0 sampled uploads).
    const missingRepresentativeThumbnail = existing.representativeVideoThumbnailUrl == null;
    const missingRepresentativeVideoId = existing.representativeVideoId == null;
    const missingDominantCategory = existing.dominantCategoryId == null;
    const missingShortsInfo = existing.hasShorts == null;
    return (
      isStale ||
      missingRepresentativeThumbnail ||
      missingRepresentativeVideoId ||
      missingDominantCategory ||
      missingShortsInfo
    );
  });

  // --- Step 3: for each batch, fetch channel metadata, then per-channel
  //     uploads + view counts, then upsert Channel + insert ChannelSnapshot ---
  let newChannels = 0;
  let refreshedChannels = 0;
  let channelsWithNoUploads = 0;

  outer: for (const idBatch of chunk(channelIdsToProcess, YOUTUBE_ID_BATCH_SIZE)) {
    if (!quota.trySpend(QUOTA_COST_LIST_CALL)) break;
    const channelMetas = await fetchChannelsMeta(idBatch, apiKey);

    for (const meta of channelMetas) {
      if (!meta.uploadsPlaylistId) {
        channelsWithNoUploads++;
        continue;
      }

      if (!quota.trySpend(QUOTA_COST_LIST_CALL)) break outer;
      const videoIds = await fetchRecentUploadVideoIds(
        meta.uploadsPlaylistId,
        apiKey,
        RECENT_UPLOADS_SAMPLE_SIZE,
      );

      if (videoIds.length === 0) {
        channelsWithNoUploads++;
        continue;
      }

      if (!quota.trySpend(QUOTA_COST_LIST_CALL)) break outer;
      const videoDetails = await fetchVideoDetails(videoIds, apiKey);
      const viewCounts = videoDetails.map((d) => d.viewCount);

      const avgViewsRecent = average(viewCounts);
      const medianViewsRecent = median(viewCounts);
      const { thumbnailUrl: representativeVideoThumbnailUrl, videoId: representativeVideoId } =
        pickRepresentativeVideo(videoDetails);
      const madeForKids = majorityFlag(videoDetails, "madeForKids");
      const containsSyntheticMedia = majorityFlag(videoDetails, "containsSyntheticMedia");
      const dominantCategoryId = pickDominantCategoryId(videoDetails);
      const { totalShortsInSample, totalLongInSample, avgShortsViews, medianShortsViews, hasShorts } =
        computeShortsStats(videoDetails);
      const tags = collectChannelTags(videoDetails);
      const isNewChannel = !existingChannelInfoById.has(meta.id);

      await upsertChannel(prisma, meta, {
        representativeVideoThumbnailUrl,
        representativeVideoId,
        madeForKids,
        containsSyntheticMedia,
        dominantCategoryId,
        totalShortsInSample,
        totalLongInSample,
        avgShortsViews,
        medianShortsViews,
        hasShorts,
        tags,
      });

      await prisma.channelSnapshot.create({
        data: {
          channelId: meta.id,
          subscriberCount: meta.subscriberCount,
          avgViewsRecent,
          medianViewsRecent,
        },
      });

      if (isNewChannel) newChannels++;
      else refreshedChannels++;
    }
  }

  return {
    newChannels,
    refreshedChannels,
    channelsWithNoUploads,
    quotaUsed: quota.used,
    quotaExceeded: quota.exceeded,
    seedsUsed: seeds,
  };
}

function printSummary(summary: RunSummary): void {
  console.log("=== YouTube discovery run summary ===");
  console.log(`Seeds used:              ${summary.seedsUsed.join(", ")}`);
  console.log(`New channels added:      ${summary.newChannels}`);
  console.log(`Channels refreshed:      ${summary.refreshedChannels}`);
  console.log(`Channels with no uploads:${summary.channelsWithNoUploads}`);
  console.log(`Estimated quota used:    ${summary.quotaUsed} / ${MAX_QUOTA_UNITS_PER_RUN} units`);
  console.log(
    summary.quotaExceeded
      ? "Quota budget reached — stopped early (expected behavior, not an error)."
      : "Run completed within quota budget.",
  );
  console.log("======================================");
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
  console.error("Discovery run failed with an unexpected error:");
  console.error(error);
  process.exit(1);
});

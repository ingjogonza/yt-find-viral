import { PrismaClient } from "@prisma/client";

/**
 * A subscriber bucket range. `max === null` means "no upper bound"
 * (e.g. the 1,000,000+ bucket).
 */
export type SubscriberBucket = {
  min: number;
  max: number | null;
};

/**
 * Subscriber buckets used to group channels for outlier comparison.
 * Editable: add/remove/resize buckets here and every consumer of this
 * module picks up the new boundaries automatically.
 */
export const SUBSCRIBER_BUCKETS: SubscriberBucket[] = [
  { min: 0, max: 1_000 },
  { min: 1_000, max: 10_000 },
  { min: 10_000, max: 50_000 },
  { min: 50_000, max: 100_000 },
  { min: 100_000, max: 500_000 },
  { min: 500_000, max: 1_000_000 },
  { min: 1_000_000, max: null },
];

/**
 * Minimum number of channels a bucket must contain before we trust its
 * median enough to compute outlier scores for channels in that bucket.
 */
export const MIN_SAMPLE_SIZE_FOR_OUTLIER = 20;

/**
 * A human-readable label for a bucket, e.g. "10,000-50,000" or "1,000,000+".
 */
export function bucketLabel(bucket: SubscriberBucket): string {
  if (bucket.max === null) {
    return `${bucket.min.toLocaleString("en-US")}+`;
  }
  return `${bucket.min.toLocaleString("en-US")}-${bucket.max.toLocaleString("en-US")}`;
}

/**
 * Finds the bucket a given subscriber count falls into, or `undefined`
 * if it doesn't match any configured bucket (should not normally happen
 * given the buckets above span [0, Infinity)).
 */
export function findBucketForSubscriberCount(
  subscriberCount: number,
  buckets: SubscriberBucket[] = SUBSCRIBER_BUCKETS,
): SubscriberBucket | undefined {
  return buckets.find(
    (bucket) =>
      subscriberCount >= bucket.min &&
      (bucket.max === null || subscriberCount < bucket.max),
  );
}

/**
 * The data point this module needs per channel: its current subscriber
 * count and its most recent `avgViewsRecent` snapshot value.
 */
type ChannelDataPoint = {
  channelId: string;
  subscriberCount: number;
  avgViewsRecent: number;
};

/**
 * Per-bucket aggregation result.
 */
export type BucketStats = {
  bucket: SubscriberBucket;
  label: string;
  sampleSize: number;
  /** Median of avgViewsRecent across channels in this bucket. Null if insufficient sample. */
  medianAvgViews: number | null;
  /** True when sampleSize < MIN_SAMPLE_SIZE_FOR_OUTLIER. */
  insufficientSample: boolean;
};

/**
 * Outlier score result for a single channel.
 */
export type ChannelOutlierResult = {
  channelId: string;
  subscriberCount: number;
  avgViewsRecent: number;
  bucket: SubscriberBucket;
  bucketLabel: string;
  bucketMedianAvgViews: number | null;
  bucketSampleSize: number;
  insufficientSample: boolean;
  /** avgViewsRecent / bucketMedianAvgViews. Null when the bucket has an insufficient sample. */
  outlierScore: number | null;
};

/**
 * Computes the median of a list of numbers. Returns null for an empty list.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Fetches the most recent avgViewsRecent per channel directly from the DB,
 * along with the channel's current subscriberCount.
 *
 * We intentionally do NOT cache/persist this — it must always reflect the
 * current state of the Channel/ChannelSnapshot tables, since new channels
 * and new snapshots shift the bucket medians.
 */
async function fetchLatestChannelDataPoints(
  prisma: PrismaClient,
): Promise<ChannelDataPoint[]> {
  const channels = await prisma.channel.findMany({
    select: {
      id: true,
      subscriberCount: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { avgViewsRecent: true },
      },
    },
  });

  return channels
    .filter((channel) => channel.snapshots.length > 0)
    .map((channel) => ({
      channelId: channel.id,
      subscriberCount: channel.subscriberCount,
      avgViewsRecent: channel.snapshots[0].avgViewsRecent,
    }));
}

/**
 * Groups already-fetched data points into per-bucket stats (sample size +
 * median avgViewsRecent). Pure function — no I/O — shared by the two
 * exported functions below so a single request only hits the DB once.
 */
function computeBucketStatsFromDataPoints(
  dataPoints: ChannelDataPoint[],
  buckets: SubscriberBucket[],
): BucketStats[] {
  return buckets.map((bucket) => {
    const inBucket = dataPoints.filter(
      (point) =>
        point.subscriberCount >= bucket.min &&
        (bucket.max === null || point.subscriberCount < bucket.max),
    );

    const sampleSize = inBucket.length;
    const insufficientSample = sampleSize < MIN_SAMPLE_SIZE_FOR_OUTLIER;
    const medianAvgViews = insufficientSample
      ? null
      : median(inBucket.map((p) => p.avgViewsRecent));

    return {
      bucket,
      label: bucketLabel(bucket),
      sampleSize,
      medianAvgViews,
      insufficientSample,
    };
  });
}

/**
 * Computes, for every configured subscriber bucket, the sample size and
 * median avgViewsRecent based on the CURRENT state of the database.
 *
 * This is always recomputed on demand — bucket medians are never persisted
 * as a fixed/cached value, since newly discovered channels shift them.
 */
export async function computeBucketStats(
  prisma: PrismaClient,
  buckets: SubscriberBucket[] = SUBSCRIBER_BUCKETS,
): Promise<BucketStats[]> {
  const dataPoints = await fetchLatestChannelDataPoints(prisma);
  return computeBucketStatsFromDataPoints(dataPoints, buckets);
}

/**
 * Computes outlier scores for every channel in the database, bucketed by
 * subscriber count. Channels whose bucket has an insufficient sample
 * (< MIN_SAMPLE_SIZE_FOR_OUTLIER channels) get `outlierScore: null` and
 * `insufficientSample: true` — no score is computed for them yet.
 *
 * `channelOutlierScore = channel.avgViewsRecent / bucketMedianAvgViewsOfItsBucket`
 *
 * Always queries Prisma fresh — never trust a cached bucket median.
 */
export async function computeChannelOutlierScores(
  prisma: PrismaClient,
  buckets: SubscriberBucket[] = SUBSCRIBER_BUCKETS,
): Promise<ChannelOutlierResult[]> {
  const dataPoints = await fetchLatestChannelDataPoints(prisma);
  const bucketStats = computeBucketStatsFromDataPoints(dataPoints, buckets);

  const statsByBucket = new Map<SubscriberBucket, BucketStats>();
  for (const stats of bucketStats) {
    statsByBucket.set(stats.bucket, stats);
  }

  return dataPoints.map((point) => {
    const bucket = findBucketForSubscriberCount(point.subscriberCount, buckets);

    // Should not happen given buckets span [0, Infinity), but guard anyway.
    if (!bucket) {
      throw new Error(
        `No subscriber bucket configured for subscriberCount=${point.subscriberCount} (channel ${point.channelId})`,
      );
    }

    const stats = statsByBucket.get(bucket)!;
    const outlierScore =
      stats.insufficientSample || stats.medianAvgViews === null || stats.medianAvgViews === 0
        ? null
        : point.avgViewsRecent / stats.medianAvgViews;

    return {
      channelId: point.channelId,
      subscriberCount: point.subscriberCount,
      avgViewsRecent: point.avgViewsRecent,
      bucket,
      bucketLabel: stats.label,
      bucketMedianAvgViews: stats.medianAvgViews,
      bucketSampleSize: stats.sampleSize,
      insufficientSample: stats.insufficientSample,
      outlierScore,
    };
  });
}

/**
 * Computes the outlier score for a single channel by id. Returns null if
 * the channel has no snapshots yet, or if its bucket has an insufficient
 * sample size.
 */
export async function computeOutlierScoreForChannel(
  prisma: PrismaClient,
  channelId: string,
  buckets: SubscriberBucket[] = SUBSCRIBER_BUCKETS,
): Promise<ChannelOutlierResult | null> {
  const results = await computeChannelOutlierScores(prisma, buckets);
  return results.find((r) => r.channelId === channelId) ?? null;
}

// ---------------------------------------------------------------------------
// Shorts outlier scores (Prompt 5) — same subscriber-bucket-median logic as
// above, but scoped to hasShorts === true channels and compared on
// avgShortsViews instead of avgViewsRecent. Does not modify or reuse the
// long-video ChannelDataPoint/BucketStats machinery's DB query (shorts data
// lives directly on Channel, not on ChannelSnapshot), but DOES reuse
// SUBSCRIBER_BUCKETS, median(), findBucketForSubscriberCount(), and
// bucketLabel() rather than duplicating that logic.
// ---------------------------------------------------------------------------

/** The data point this function needs per shorts-having channel. */
type ShortsChannelDataPoint = {
  channelId: string;
  subscriberCount: number;
  avgShortsViews: number;
};

export type ShortsBucketStats = {
  bucket: SubscriberBucket;
  label: string;
  sampleSize: number;
  /** Median of avgShortsViews across hasShorts=true channels in this bucket. Null if insufficient sample. */
  medianAvgShortsViews: number | null;
  /** True when sampleSize < MIN_SAMPLE_SIZE_FOR_OUTLIER. */
  insufficientSample: boolean;
};

export type ShortsChannelOutlierResult = {
  channelId: string;
  subscriberCount: number;
  avgShortsViews: number;
  bucket: SubscriberBucket;
  bucketLabel: string;
  bucketMedianAvgShortsViews: number | null;
  bucketSampleSize: number;
  insufficientSample: boolean;
  /** avgShortsViews / bucketMedianAvgShortsViews. Null when the bucket has an insufficient sample. */
  outlierScore: number | null;
};

/**
 * Fetches subscriberCount + avgShortsViews for every channel with
 * hasShorts === true and a non-null avgShortsViews. We intentionally do NOT
 * cache/persist this, for the same reason as fetchLatestChannelDataPoints
 * above: it must always reflect the current DB state.
 */
async function fetchShortsChannelDataPoints(
  prisma: PrismaClient,
): Promise<ShortsChannelDataPoint[]> {
  const channels = await prisma.channel.findMany({
    where: { hasShorts: true, avgShortsViews: { not: null } },
    select: {
      id: true,
      subscriberCount: true,
      avgShortsViews: true,
    },
  });

  return channels
    .filter((channel): channel is typeof channel & { avgShortsViews: number } => channel.avgShortsViews != null)
    .map((channel) => ({
      channelId: channel.id,
      subscriberCount: channel.subscriberCount,
      avgShortsViews: channel.avgShortsViews,
    }));
}

function computeShortsBucketStatsFromDataPoints(
  dataPoints: ShortsChannelDataPoint[],
  buckets: SubscriberBucket[],
): ShortsBucketStats[] {
  return buckets.map((bucket) => {
    const inBucket = dataPoints.filter(
      (point) =>
        point.subscriberCount >= bucket.min &&
        (bucket.max === null || point.subscriberCount < bucket.max),
    );

    const sampleSize = inBucket.length;
    const insufficientSample = sampleSize < MIN_SAMPLE_SIZE_FOR_OUTLIER;
    const medianAvgShortsViews = insufficientSample
      ? null
      : median(inBucket.map((p) => p.avgShortsViews));

    return {
      bucket,
      label: bucketLabel(bucket),
      sampleSize,
      medianAvgShortsViews,
      insufficientSample,
    };
  });
}

/**
 * Computes, for every configured subscriber bucket, the sample size and
 * median avgShortsViews among hasShorts=true channels, based on the CURRENT
 * state of the database.
 */
export async function computeShortsBucketStats(
  prisma: PrismaClient,
  buckets: SubscriberBucket[] = SUBSCRIBER_BUCKETS,
): Promise<ShortsBucketStats[]> {
  const dataPoints = await fetchShortsChannelDataPoints(prisma);
  return computeShortsBucketStatsFromDataPoints(dataPoints, buckets);
}

/**
 * Computes shorts outlier scores for every channel with hasShorts === true,
 * bucketed by subscriber count — the shorts-tab equivalent of
 * computeChannelOutlierScores. Channels whose bucket has an insufficient
 * sample (< MIN_SAMPLE_SIZE_FOR_OUTLIER channels) get `outlierScore: null`
 * and `insufficientSample: true`.
 *
 * `shortsOutlierScore = channel.avgShortsViews / bucketMedianAvgShortsViewsOfItsBucket`
 *
 * Always queries Prisma fresh — never trust a cached bucket median.
 */
export async function computeShortsChannelOutlierScores(
  prisma: PrismaClient,
  buckets: SubscriberBucket[] = SUBSCRIBER_BUCKETS,
): Promise<ShortsChannelOutlierResult[]> {
  const dataPoints = await fetchShortsChannelDataPoints(prisma);
  const bucketStats = computeShortsBucketStatsFromDataPoints(dataPoints, buckets);

  const statsByBucket = new Map<SubscriberBucket, ShortsBucketStats>();
  for (const stats of bucketStats) {
    statsByBucket.set(stats.bucket, stats);
  }

  return dataPoints.map((point) => {
    const bucket = findBucketForSubscriberCount(point.subscriberCount, buckets);

    // Should not happen given buckets span [0, Infinity), but guard anyway.
    if (!bucket) {
      throw new Error(
        `No subscriber bucket configured for subscriberCount=${point.subscriberCount} (channel ${point.channelId})`,
      );
    }

    const stats = statsByBucket.get(bucket)!;
    const outlierScore =
      stats.insufficientSample || stats.medianAvgShortsViews === null || stats.medianAvgShortsViews === 0
        ? null
        : point.avgShortsViews / stats.medianAvgShortsViews;

    return {
      channelId: point.channelId,
      subscriberCount: point.subscriberCount,
      avgShortsViews: point.avgShortsViews,
      bucket,
      bucketLabel: stats.label,
      bucketMedianAvgShortsViews: stats.medianAvgShortsViews,
      bucketSampleSize: stats.sampleSize,
      insufficientSample: stats.insufficientSample,
      outlierScore,
    };
  });
}

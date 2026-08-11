import { PrismaClient } from "@prisma/client";
import { computeChannelOutlierScores } from "./outlier";
import { estimateCategoryRpm } from "./rpm";
import { getFavoriteChannelIds } from "./favorites";

/**
 * Data layer for `/dashboard` (Prompt 7). Reads (never modifies)
 * src/lib/outlier.ts and src/lib/rpm.ts. Every number here comes from our
 * own DB — no YouTube API calls (same convention as catalog.ts).
 *
 * One "scope" filter (`all` vs `favorites`) applies to every chart AND the
 * suggested-niches panel at once — see loadDashboardData below, which does
 * exactly one outlier computation + one channel fetch per request and
 * derives all four charts' data from that single in-memory pass.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A channel counts as a scatter/niche "outlier" at this outlierScore or above. */
export const OUTLIER_OF_INTEREST_THRESHOLD = 3;

/** Categories with fewer channels than this are excluded from suggested niches
 * ("muestra insuficiente") — too few data points to mean anything. */
export const MIN_CHANNELS_FOR_NICHE = 3;

/** How many top categories (by nicheScore) the bar chart shows. */
export const TOP_CATEGORIES_BAR_COUNT = 8;

/** Discovery timeline window for the line chart. */
const DISCOVERY_TIMELINE_DAYS = 30;

/** Fixed-width histogram bins for channel_outlier_score, plus an overflow bin. */
const HISTOGRAM_BIN_WIDTH = 0.5;
const HISTOGRAM_BIN_COUNT = 10; // covers [0, 5) in 0.5-wide steps, plus a "5+" overflow bin

export type DashboardScope = "all" | "favorites";

export function isDashboardScope(value: string | undefined): value is DashboardScope {
  return value === "all" || value === "favorites";
}

export type ScatterPoint = {
  id: string;
  title: string;
  subscriberCount: number;
  avgViewsRecent: number;
  outlierScore: number | null;
  isOutlier: boolean;
};

export type CategoryBar = {
  categoryId: string;
  nicheScore: number;
};

export type HistogramBin = {
  label: string;
  count: number;
};

export type DiscoveryPoint = {
  /** ISO "yyyy-mm-dd" for the day. */
  date: string;
  count: number;
};

export type SuggestedNiche = {
  categoryId: string;
  channelCount: number;
  outlierChannelCount: number;
  avgOutlierScore: number;
  avgEstimatedRpm: number | null;
  nicheScore: number;
};

export type DashboardData = {
  scope: DashboardScope;
  totalChannelsInScope: number;
  scatterPoints: ScatterPoint[];
  topCategoryBars: CategoryBar[];
  histogram: HistogramBin[];
  discoveryTimeline: DiscoveryPoint[];
  suggestedNiches: SuggestedNiche[];
};

// ---------------------------------------------------------------------------
// Shared in-memory dataset (one DB round trip per request)
// ---------------------------------------------------------------------------

type ScopedChannel = {
  id: string;
  title: string;
  dominantCategoryId: string | null;
  subscriberCount: number;
  avgViewsRecent: number;
  firstDiscoveredAt: Date;
  outlierScore: number | null;
};

async function fetchScopedChannels(prisma: PrismaClient, scope: DashboardScope): Promise<ScopedChannel[]> {
  const [outlierResults, channels, favoriteIds] = await Promise.all([
    computeChannelOutlierScores(prisma),
    prisma.channel.findMany({
      select: {
        id: true,
        title: true,
        dominantCategoryId: true,
        subscriberCount: true,
        firstDiscoveredAt: true,
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          select: { avgViewsRecent: true },
        },
      },
    }),
    scope === "favorites" ? getFavoriteChannelIds(prisma) : Promise.resolve(null),
  ]);

  const outlierByChannelId = new Map(outlierResults.map((r) => [r.channelId, r.outlierScore]));

  return channels
    .filter((c) => favoriteIds === null || favoriteIds.has(c.id))
    .filter((c) => c.snapshots.length > 0)
    .map((c) => ({
      id: c.id,
      title: c.title,
      dominantCategoryId: c.dominantCategoryId,
      subscriberCount: c.subscriberCount,
      avgViewsRecent: c.snapshots[0].avgViewsRecent,
      firstDiscoveredAt: c.firstDiscoveredAt,
      outlierScore: outlierByChannelId.get(c.id) ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Scatter (chart 1)
// ---------------------------------------------------------------------------

function buildScatterPoints(channels: ScopedChannel[]): ScatterPoint[] {
  return channels.map((c) => ({
    id: c.id,
    title: c.title,
    subscriberCount: c.subscriberCount,
    avgViewsRecent: c.avgViewsRecent,
    outlierScore: c.outlierScore,
    isOutlier: c.outlierScore != null && c.outlierScore >= OUTLIER_OF_INTEREST_THRESHOLD,
  }));
}

// ---------------------------------------------------------------------------
// Suggested niches + top-categories bar (chart 2 reuses this)
// ---------------------------------------------------------------------------

function buildSuggestedNiches(channels: ScopedChannel[]): SuggestedNiche[] {
  const byCategory = new Map<string, ScopedChannel[]>();
  for (const channel of channels) {
    if (!channel.dominantCategoryId) continue;
    const list = byCategory.get(channel.dominantCategoryId) ?? [];
    list.push(channel);
    byCategory.set(channel.dominantCategoryId, list);
  }

  const niches: SuggestedNiche[] = [];
  for (const [categoryId, categoryChannels] of byCategory) {
    if (categoryChannels.length < MIN_CHANNELS_FOR_NICHE) continue;

    const scored = categoryChannels.filter((c): c is ScopedChannel & { outlierScore: number } => c.outlierScore != null);
    const outlierChannelCount = scored.filter((c) => c.outlierScore >= OUTLIER_OF_INTEREST_THRESHOLD).length;
    const avgOutlierScore = scored.length > 0 ? scored.reduce((sum, c) => sum + c.outlierScore, 0) / scored.length : 0;
    const avgEstimatedRpm = estimateCategoryRpm(categoryId).rpm;

    niches.push({
      categoryId,
      channelCount: categoryChannels.length,
      outlierChannelCount,
      avgOutlierScore,
      avgEstimatedRpm,
      nicheScore: avgOutlierScore * outlierChannelCount,
    });
  }

  return niches.sort((a, b) => b.nicheScore - a.nicheScore);
}

// ---------------------------------------------------------------------------
// Histogram (chart 3)
// ---------------------------------------------------------------------------

function buildHistogram(channels: ScopedChannel[]): HistogramBin[] {
  const bins: HistogramBin[] = [];
  for (let i = 0; i < HISTOGRAM_BIN_COUNT; i++) {
    const lo = i * HISTOGRAM_BIN_WIDTH;
    const hi = lo + HISTOGRAM_BIN_WIDTH;
    bins.push({ label: `${lo.toFixed(1)}-${hi.toFixed(1)}`, count: 0 });
  }
  bins.push({ label: `${(HISTOGRAM_BIN_COUNT * HISTOGRAM_BIN_WIDTH).toFixed(1)}+`, count: 0 });

  for (const channel of channels) {
    if (channel.outlierScore == null) continue;
    const index = Math.min(Math.floor(channel.outlierScore / HISTOGRAM_BIN_WIDTH), HISTOGRAM_BIN_COUNT);
    bins[index].count += 1;
  }

  return bins;
}

// ---------------------------------------------------------------------------
// Discovery timeline (chart 4) — date_trunc requires raw SQL, Prisma's
// groupBy can't truncate a DateTime column to "day".
// ---------------------------------------------------------------------------

type DiscoveryRow = { day: Date; count: bigint };

async function fetchDiscoveryTimeline(prisma: PrismaClient, scope: DashboardScope): Promise<DiscoveryPoint[]> {
  const since = new Date(Date.now() - DISCOVERY_TIMELINE_DAYS * MS_PER_DAY);

  const rows: DiscoveryRow[] =
    scope === "favorites"
      ? await prisma.$queryRaw<DiscoveryRow[]>`
          SELECT date_trunc('day', "firstDiscoveredAt") AS day, COUNT(*)::bigint AS count
          FROM "Channel"
          WHERE "firstDiscoveredAt" >= ${since}
            AND "id" IN (SELECT "channelId" FROM "FavoriteChannel")
          GROUP BY day
          ORDER BY day ASC
        `
      : await prisma.$queryRaw<DiscoveryRow[]>`
          SELECT date_trunc('day', "firstDiscoveredAt") AS day, COUNT(*)::bigint AS count
          FROM "Channel"
          WHERE "firstDiscoveredAt" >= ${since}
          GROUP BY day
          ORDER BY day ASC
        `;

  const countByDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));

  // Fill every day in the window (including zero-count days) so the line
  // doesn't visually skip gaps.
  const points: DiscoveryPoint[] = [];
  for (let i = DISCOVERY_TIMELINE_DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * MS_PER_DAY).toISOString().slice(0, 10);
    points.push({ date, count: countByDay.get(date) ?? 0 });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Top-level loader
// ---------------------------------------------------------------------------

export async function loadDashboardData(prisma: PrismaClient, scope: DashboardScope): Promise<DashboardData> {
  const [channels, discoveryTimeline] = await Promise.all([
    fetchScopedChannels(prisma, scope),
    fetchDiscoveryTimeline(prisma, scope),
  ]);

  const suggestedNiches = buildSuggestedNiches(channels);

  return {
    scope,
    totalChannelsInScope: channels.length,
    scatterPoints: buildScatterPoints(channels),
    topCategoryBars: suggestedNiches
      .slice(0, TOP_CATEGORIES_BAR_COUNT)
      .map((n) => ({ categoryId: n.categoryId, nicheScore: n.nicheScore })),
    histogram: buildHistogram(channels),
    discoveryTimeline,
    suggestedNiches,
  };
}

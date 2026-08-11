import { YOUTUBE_CATEGORY_NAMES, youtubeCategoryName } from "./youtube-categories";

/**
 * Static, editable RPM (revenue per 1,000 views) table in USD, used to
 * produce ROUGH monthly revenue ESTIMATES for channels in the catalog.
 *
 * Keyed by YouTube's official numeric category IDs (as strings) — the same
 * IDs scripts/discover.ts now reads from snippet.categoryId and stores as
 * Channel.dominantCategoryId (see src/lib/youtube-categories.ts, the
 * authoritative id -> name map this file imports rather than duplicating).
 *
 * Every value here is a rough, editable placeholder — real RPM varies a lot
 * by niche, geography, seasonality, and ad market conditions. Treat these
 * as starting points, not facts.
 */
export const CATEGORY_RPM_USD: Record<string, number> = {
  "1": 3, // Film & Animation
  "2": 6, // Autos & Vehicles
  "10": 2, // Music
  "15": 3, // Pets & Animals
  "17": 4, // Sports
  "18": 2, // Short Movies
  "19": 5, // Travel & Events
  "20": 3, // Gaming
  "21": 3, // Videoblogging
  "22": 3, // People & Blogs
  "23": 2.5, // Comedy
  "24": 3, // Entertainment
  "25": 10, // News & Politics
  "26": 6, // Howto & Style
  "27": 7, // Education
  "28": 9, // Science & Technology
  "29": 3, // Nonprofits & Activism
  "30": 3, // Movies
  "31": 3, // Anime/Animation
  "32": 3, // Action/Adventure
  "33": 3, // Classics
  "34": 2.5, // Comedy
  "35": 4, // Documentary
  "36": 3, // Drama
  "37": 4, // Family
  "38": 3, // Foreign
  "39": 3, // Horror
  "40": 3, // Sci-Fi/Fantasy
  "41": 3, // Thriller
  "42": 2, // Shorts
  "43": 3, // Shows
  "44": 2, // Trailers
};

/**
 * RPM used for a channel WITH a category that isn't in CATEGORY_RPM_USD
 * above (should be rare — the table covers every id in
 * YOUTUBE_CATEGORY_NAMES — but kept as a safety net for any id YouTube adds
 * later). Always flagged via `isFallback` wherever used, so callers can mark
 * it as a rougher guess in the UI.
 *
 * NOT used when there's no category at all — see estimateCategoryRpm below,
 * which returns `rpm: null` in that case instead of this default.
 */
export const DEFAULT_RPM_USD = 3;

/**
 * Simple assumption used to turn an average per-video view count into a
 * monthly estimate, absent real per-channel upload-cadence data.
 */
export const ASSUMED_UPLOADS_PER_MONTH = 4;

/**
 * Disclaimer to render next to ANY estimated revenue/RPM figure. Never
 * present these numbers as confirmed/real revenue.
 */
export const REVENUE_ESTIMATE_DISCLAIMER_ES = "Estimación aproximada, no son ingresos reales.";

export type RpmEstimate = {
  /** Null only when there's no category to estimate from (channel not yet
   * classified) — never 0 and never DEFAULT_RPM_USD in that case, so the UI
   * can tell "no data yet" apart from a real (if rough) estimate. */
  rpm: number | null;
  /** True when DEFAULT_RPM_USD was used because the category isn't in
   * CATEGORY_RPM_USD. False when there's no category at all (rpm is null). */
  isFallback: boolean;
};

/**
 * Looks up the RPM for a category id.
 * - No category (null/undefined) -> { rpm: null, isFallback: false }: there
 *   is nothing to estimate from yet, not a "default" estimate.
 * - Category present but not in CATEGORY_RPM_USD -> DEFAULT_RPM_USD,
 *   isFallback: true.
 * - Category present and in CATEGORY_RPM_USD -> that value, isFallback: false.
 */
export function estimateCategoryRpm(categoryId: string | null | undefined): RpmEstimate {
  if (!categoryId) return { rpm: null, isFallback: false };
  if (categoryId in CATEGORY_RPM_USD) {
    return { rpm: CATEGORY_RPM_USD[categoryId], isFallback: false };
  }
  return { rpm: DEFAULT_RPM_USD, isFallback: true };
}

export type RevenueEstimate = {
  rpm: number | null;
  isFallback: boolean;
  estimatedMonthlyRevenue: number | null;
};

/**
 * estimatedMonthlyRevenue = (avgViewsRecent / 1000) * categoryRpm * ASSUMED_UPLOADS_PER_MONTH
 *
 * Returns `rpm: null` and `estimatedMonthlyRevenue: null` when the channel
 * has no category yet (unclassified) — render "sin datos todavía" in the UI
 * for that case, never a number that could be mistaken for a real estimate.
 * Returns `estimatedMonthlyRevenue: null` (but a real `rpm`) when
 * `avgViewsRecent` isn't available either. Never throws.
 */
export function estimateMonthlyRevenue(
  avgViewsRecent: number | null | undefined,
  categoryId: string | null | undefined,
): RevenueEstimate {
  const { rpm, isFallback } = estimateCategoryRpm(categoryId);

  if (rpm == null || avgViewsRecent == null || !Number.isFinite(avgViewsRecent)) {
    return { rpm, isFallback, estimatedMonthlyRevenue: null };
  }

  const estimatedMonthlyRevenue = (avgViewsRecent / 1000) * rpm * ASSUMED_UPLOADS_PER_MONTH;
  return { rpm, isFallback, estimatedMonthlyRevenue };
}

/**
 * Human-friendly label for a category id. Delegates to youtube-categories.ts
 * (the single source of truth for id -> name) instead of keeping a second,
 * separately-maintained label map here — that duplication is exactly what
 * caused this file to fall out of sync with real category ids in the first
 * place.
 */
export function categoryLabel(categoryId: string | null | undefined): string {
  return youtubeCategoryName(categoryId);
}

// Re-exported for callers that want the raw id -> name map (e.g. building a
// category dropdown) without importing youtube-categories.ts separately.
export { YOUTUBE_CATEGORY_NAMES };

import { PrismaClient } from "@prisma/client";
import { computeShortsChannelOutlierScores } from "./outlier";

/**
 * Data layer for the Shorts tab (`/shorts`, Prompt 5). Mirrors
 * src/lib/catalog.ts's approach (URL searchParams as the single source of
 * truth for filters/sort/page, one full in-memory pass per request) but
 * scoped to channels with hasShorts === true and their shorts-specific
 * metrics (totalShortsInSample/avgShortsViews/medianShortsViews +
 * computeShortsChannelOutlierScores from src/lib/outlier.ts) instead of the
 * long-video metrics the main catalog uses.
 *
 * Same scale tradeoff as catalog.ts: an in-memory filter/sort pass over
 * every hasShorts=true channel is fine at today's catalog size and keeps
 * one single, easy-to-verify code path.
 */

export const SHORTS_RESULTS_PER_PAGE = 50;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Filters: parsed from URL searchParams, same convention as catalog.ts.
// ---------------------------------------------------------------------------

export type ShortsFilters = {
  avgMin: number | null;
  avgMax: number | null;
  subMin: number | null;
  subMax: number | null;
  outlierMin: number | null;
  outlierMax: number | null;
  category: string | null;
  country: string | null;
  language: string | null;
  page: number;
};

export const DEFAULT_SHORTS_FILTERS: ShortsFilters = {
  avgMin: null,
  avgMax: null,
  subMin: null,
  subMax: null,
  outlierMin: null,
  outlierMax: null,
  category: null,
  country: null,
  language: null,
  page: 1,
};

/** Shape of Next.js's `searchParams` (App Router page prop, already awaited). */
export type ShortsSearchParams = Record<string, string | string[] | undefined>;

function parseNumberParam(value: string | string[] | undefined): number | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringParam(value: string | string[] | undefined): string | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parses raw URL searchParams into a fully-typed, defaulted ShortsFilters. */
export function parseShortsFilters(searchParams: ShortsSearchParams): ShortsFilters {
  const page = parseNumberParam(searchParams.page);
  return {
    avgMin: parseNumberParam(searchParams.avgMin),
    avgMax: parseNumberParam(searchParams.avgMax),
    subMin: parseNumberParam(searchParams.subMin),
    subMax: parseNumberParam(searchParams.subMax),
    outlierMin: parseNumberParam(searchParams.outlierMin),
    outlierMax: parseNumberParam(searchParams.outlierMax),
    category: parseStringParam(searchParams.category),
    country: parseStringParam(searchParams.country),
    language: parseStringParam(searchParams.language),
    page: page && page > 0 ? Math.floor(page) : DEFAULT_SHORTS_FILTERS.page,
  };
}

/**
 * Overrides used to build a link that starts from a base ShortsFilters and
 * changes only some fields. `null` clears a field, `undefined` (i.e. simply
 * omitting the key) keeps the base value. Same convention as
 * catalog.ts's FilterOverrides/buildCatalogHref.
 */
export type ShortsFilterOverrides = {
  avgMin?: number | null;
  avgMax?: number | null;
  subMin?: number | null;
  subMax?: number | null;
  outlierMin?: number | null;
  outlierMax?: number | null;
  category?: string | null;
  country?: string | null;
  language?: string | null;
  page?: number | null;
};

function resolveOverride<T>(overrideValue: T | null | undefined, baseValue: T): T | null {
  return overrideValue === undefined ? baseValue : overrideValue;
}

/** Builds an href for `/shorts` with `base` filters plus `overrides` applied. */
export function buildShortsHref(base: ShortsFilters, overrides: ShortsFilterOverrides = {}): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | null) => {
    if (value === null || value === "") return;
    params.set(key, String(value));
  };

  put("avgMin", resolveOverride(overrides.avgMin, base.avgMin));
  put("avgMax", resolveOverride(overrides.avgMax, base.avgMax));
  put("subMin", resolveOverride(overrides.subMin, base.subMin));
  put("subMax", resolveOverride(overrides.subMax, base.subMax));
  put("outlierMin", resolveOverride(overrides.outlierMin, base.outlierMin));
  put("outlierMax", resolveOverride(overrides.outlierMax, base.outlierMax));
  put("category", resolveOverride(overrides.category, base.category));
  put("country", resolveOverride(overrides.country, base.country));
  put("language", resolveOverride(overrides.language, base.language));

  const page = resolveOverride(overrides.page, base.page);
  if (page !== null && page > 1) put("page", page);

  const qs = params.toString();
  return qs ? `/shorts?${qs}` : "/shorts";
}

// ---------------------------------------------------------------------------
// Row shape + enrichment
// ---------------------------------------------------------------------------

export type ShortsRow = {
  id: string;
  title: string;
  thumbnailUrl: string;
  dominantCategoryId: string | null;
  country: string | null;
  language: string | null;
  subscriberCount: number;
  totalShortsInSample: number;
  avgShortsViews: number;
  medianShortsViews: number;
  daysSinceStart: number;
  outlierScore: number | null;
  bucketLabel: string;
  insufficientSample: boolean;
};

type ChannelWithShortsData = {
  id: string;
  title: string;
  thumbnailUrl: string;
  dominantCategoryId: string | null;
  country: string | null;
  defaultLanguage: string | null;
  subscriberCount: number;
  channelPublishedAt: Date;
  totalShortsInSample: number | null;
  avgShortsViews: number | null;
  medianShortsViews: number | null;
};

async function fetchShortsChannels(prisma: PrismaClient): Promise<ChannelWithShortsData[]> {
  return prisma.channel.findMany({
    where: { hasShorts: true },
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      dominantCategoryId: true,
      country: true,
      defaultLanguage: true,
      subscriberCount: true,
      channelPublishedAt: true,
      totalShortsInSample: true,
      avgShortsViews: true,
      medianShortsViews: true,
    },
  });
}

type ShortsOutlierByChannelId = Map<
  string,
  Awaited<ReturnType<typeof computeShortsChannelOutlierScores>>[number]
>;

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / MS_PER_DAY));
}

/** Enriches a raw hasShorts=true Channel row with its outlier score.
 * Returns null when avgShortsViews/totalShortsInSample are missing despite
 * hasShorts=true (shouldn't happen given discover.ts always sets them
 * together, but guarded defensively — same convention as catalog.ts's
 * enrichChannel returning null for channels with no snapshot). */
function enrichShortsChannel(
  channel: ChannelWithShortsData,
  outlierByChannelId: ShortsOutlierByChannelId,
): ShortsRow | null {
  if (channel.avgShortsViews == null || channel.medianShortsViews == null || channel.totalShortsInSample == null) {
    return null;
  }

  const outlier = outlierByChannelId.get(channel.id);

  return {
    id: channel.id,
    title: channel.title,
    thumbnailUrl: channel.thumbnailUrl,
    dominantCategoryId: channel.dominantCategoryId,
    country: channel.country,
    language: channel.defaultLanguage,
    subscriberCount: channel.subscriberCount,
    totalShortsInSample: channel.totalShortsInSample,
    avgShortsViews: channel.avgShortsViews,
    medianShortsViews: channel.medianShortsViews,
    daysSinceStart: daysSince(channel.channelPublishedAt),
    outlierScore: outlier?.outlierScore ?? null,
    bucketLabel: outlier?.bucketLabel ?? "",
    insufficientSample: outlier?.insufficientSample ?? true,
  };
}

// ---------------------------------------------------------------------------
// Filtering + sorting (in-memory — see design note at the top of the file).
// Default sort: outlier score descending, insufficient-sample rows last —
// no sort UI is exposed for this tab (out of scope per spec), but nulls
// still sort predictably to the end.
// ---------------------------------------------------------------------------

function matchesShortsFilters(row: ShortsRow, filters: ShortsFilters): boolean {
  if (filters.avgMin != null && row.avgShortsViews < filters.avgMin) return false;
  if (filters.avgMax != null && row.avgShortsViews > filters.avgMax) return false;
  if (filters.subMin != null && row.subscriberCount < filters.subMin) return false;
  if (filters.subMax != null && row.subscriberCount > filters.subMax) return false;
  if (filters.outlierMin != null && (row.outlierScore == null || row.outlierScore < filters.outlierMin)) return false;
  if (filters.outlierMax != null && (row.outlierScore == null || row.outlierScore > filters.outlierMax)) return false;
  if (filters.category != null && row.dominantCategoryId !== filters.category) return false;
  if (filters.country != null && row.country !== filters.country) return false;
  if (filters.language != null && row.language !== filters.language) return false;
  return true;
}

function compareShortsRows(a: ShortsRow, b: ShortsRow): number {
  if (a.outlierScore == null && b.outlierScore == null) return 0;
  if (a.outlierScore == null) return 1;
  if (b.outlierScore == null) return -1;
  return b.outlierScore - a.outlierScore;
}

// ---------------------------------------------------------------------------
// Distinct dropdown values, scoped to hasShorts=true channels only (queried
// from the already-fetched in-memory set, never hardcoded).
// ---------------------------------------------------------------------------

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Top-level page data loader
// ---------------------------------------------------------------------------

export type ShortsPageData = {
  rows: ShortsRow[];
  totalMatching: number;
  totalShortsChannels: number;
  page: number;
  totalPages: number;
  distinctCategories: string[];
  distinctCountries: string[];
  distinctLanguages: string[];
};

/**
 * Loads everything the shorts page needs for one request: dropdown option
 * lists (scoped to hasShorts=true channels) and the
 * filtered/sorted/paginated results table.
 *
 * Calls computeShortsChannelOutlierScores exactly ONCE — its result is
 * reused for every row, so bucket medians are never recomputed per row.
 */
export async function loadShortsPageData(
  prisma: PrismaClient,
  filters: ShortsFilters,
): Promise<ShortsPageData> {
  const [outlierResults, channels] = await Promise.all([
    computeShortsChannelOutlierScores(prisma),
    fetchShortsChannels(prisma),
  ]);

  const outlierByChannelId: ShortsOutlierByChannelId = new Map(
    outlierResults.map((result) => [result.channelId, result]),
  );

  const allRows = channels
    .map((channel) => enrichShortsChannel(channel, outlierByChannelId))
    .filter((row): row is ShortsRow => row !== null);

  const distinctCategories = uniqueSorted(allRows.map((r) => r.dominantCategoryId));
  const distinctCountries = uniqueSorted(allRows.map((r) => r.country));
  const distinctLanguages = uniqueSorted(allRows.map((r) => r.language));

  const filteredRows = allRows.filter((row) => matchesShortsFilters(row, filters));
  filteredRows.sort(compareShortsRows);

  const totalMatching = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalMatching / SHORTS_RESULTS_PER_PAGE));
  const safePage = Math.min(Math.max(1, filters.page), totalPages);
  const start = (safePage - 1) * SHORTS_RESULTS_PER_PAGE;
  const rows = filteredRows.slice(start, start + SHORTS_RESULTS_PER_PAGE);

  return {
    rows,
    totalMatching,
    totalShortsChannels: allRows.length,
    page: safePage,
    totalPages,
    distinctCategories,
    distinctCountries,
    distinctLanguages,
  };
}

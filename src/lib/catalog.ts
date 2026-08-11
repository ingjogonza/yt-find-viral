import { PrismaClient } from "@prisma/client";
import { computeChannelOutlierScores } from "./outlier";
import { estimateMonthlyRevenue } from "./rpm";
import { isChannelFormat, isChannelQuality, type ChannelFormat, type ChannelQuality } from "./classification";

/**
 * Data layer for the main catalog page (`/`). Every number shown on that
 * page comes from Prisma queries against our own DB — this module never
 * calls the YouTube Data API (that only happens in scripts/discover.ts).
 *
 * DESIGN NOTE (filtering/sorting/pagination approach):
 * `computeChannelOutlierScores` (src/lib/outlier.ts) already does a full
 * table scan to compute correct bucket medians — there's no way around that
 * for a correct outlier score. Rather than layering DB-level WHERE/ORDER BY
 * for some fields (subscriberCount, videoCount, channelPublishedAt, ...)
 * and in-memory filtering for the fields that can't be expressed as a
 * simple Prisma query (avgViewsRecent/medianViewsRecent come from each
 * channel's MOST RECENT snapshot only, and outlierScore/rpm/revenue are
 * derived values), this module fetches the full channel+latest-snapshot
 * dataset ONCE per request and does ALL filtering, sorting, and pagination
 * in memory. That keeps one single, easy-to-verify code path instead of a
 * split DB/in-memory implementation.
 *
 * Tradeoff: this does not scale to a huge catalog (would want DB-level
 * WHERE/ORDER BY + indexes, or a materialized view for bucket medians, at
 * tens of thousands of rows). At today's scale — discovery is capped by
 * MAX_QUOTA_UNITS_PER_RUN per run — an in-memory pass over the whole
 * catalog per request is fine and keeps this prompt's scope small.
 * `computeChannelOutlierScores` itself is only ever called ONCE per
 * request/page load, never once per row.
 */

export const RESULTS_PER_PAGE = 50;

const OUTLIER_HIGHLIGHT_WINDOW_DAYS = 7;
const OUTLIER_HIGHLIGHT_LIMIT = 10;
const RECENT_SNAPSHOT_WINDOW_HOURS = 48;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export type SortField =
  | "outlier"
  | "avgViews"
  | "medianViews"
  | "subscribers"
  | "videoCount"
  | "daysSinceStart"
  | "rpm"
  | "revenue"
  | "firstDiscovered"
  | "title";

export type SortDirection = "asc" | "desc";

/** Three-state faces/faceless toggle: any / only faceless / only channels with a presenter. */
export type FacesFilter = "faceless" | "presenter";

const VALID_SORT_FIELDS: ReadonlySet<SortField> = new Set([
  "outlier",
  "avgViews",
  "medianViews",
  "subscribers",
  "videoCount",
  "daysSinceStart",
  "rpm",
  "revenue",
  "firstDiscovered",
  "title",
]);

// ---------------------------------------------------------------------------
// Filters: parsed from URL searchParams, the single source of truth for the
// page's state (no client-only filter state — everything round-trips
// through the URL so results are shareable/bookmarkable).
// ---------------------------------------------------------------------------

export type CatalogFilters = {
  q: string | null;
  subMin: number | null;
  subMax: number | null;
  avgMin: number | null;
  avgMax: number | null;
  outlierMin: number | null;
  outlierMax: number | null;
  videoMin: number | null;
  videoMax: number | null;
  daysMin: number | null;
  daysMax: number | null;
  category: string | null;
  country: string | null;
  language: string | null;
  rpmMin: number | null;
  rpmMax: number | null;
  /** Classification filters (Prompt 3) — populated by scripts/classify.ts.
   * Channels with classifiedAt = null never match a non-null value here
   * (they're excluded, same convention as every other filter); they only
   * show up when the filter is left at "any" (null). */
  format: ChannelFormat | null;
  quality: ChannelQuality | null;
  faces: FacesFilter | null;
  madeForKids: boolean | null;
  syntheticMedia: boolean | null;
  sort: SortField;
  dir: SortDirection;
  page: number;
};

export const DEFAULT_FILTERS: CatalogFilters = {
  q: null,
  subMin: null,
  subMax: null,
  avgMin: null,
  avgMax: null,
  outlierMin: null,
  outlierMax: null,
  videoMin: null,
  videoMax: null,
  daysMin: null,
  daysMax: null,
  category: null,
  country: null,
  language: null,
  rpmMin: null,
  rpmMax: null,
  format: null,
  quality: null,
  faces: null,
  madeForKids: null,
  syntheticMedia: null,
  sort: "firstDiscovered",
  dir: "desc",
  page: 1,
};

/** Shape of Next.js's `searchParams` (App Router page prop, already awaited). */
export type CatalogSearchParams = Record<string, string | string[] | undefined>;

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

function parseSortParam(value: string | string[] | undefined): SortField {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  return raw && VALID_SORT_FIELDS.has(raw as SortField) ? (raw as SortField) : DEFAULT_FILTERS.sort;
}

function parseDirParam(value: string | string[] | undefined): SortDirection {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  return raw === "asc" ? "asc" : DEFAULT_FILTERS.dir;
}

/** "yes" -> true, "no" -> false, anything else (including absent) -> null ("cualquiera"). */
function parseYesNoParam(value: string | string[] | undefined): boolean | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (raw === "yes") return true;
  if (raw === "no") return false;
  return null;
}

function parseFormatParam(value: string | string[] | undefined): ChannelFormat | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  return isChannelFormat(raw) ? raw : null;
}

function parseQualityParam(value: string | string[] | undefined): ChannelQuality | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  return isChannelQuality(raw) ? raw : null;
}

function parseFacesParam(value: string | string[] | undefined): FacesFilter | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  return raw === "faceless" || raw === "presenter" ? raw : null;
}

/** Parses raw URL searchParams into a fully-typed, defaulted CatalogFilters. */
export function parseCatalogFilters(searchParams: CatalogSearchParams): CatalogFilters {
  const page = parseNumberParam(searchParams.page);
  return {
    q: parseStringParam(searchParams.q),
    subMin: parseNumberParam(searchParams.subMin),
    subMax: parseNumberParam(searchParams.subMax),
    avgMin: parseNumberParam(searchParams.avgMin),
    avgMax: parseNumberParam(searchParams.avgMax),
    outlierMin: parseNumberParam(searchParams.outlierMin),
    outlierMax: parseNumberParam(searchParams.outlierMax),
    videoMin: parseNumberParam(searchParams.videoMin),
    videoMax: parseNumberParam(searchParams.videoMax),
    daysMin: parseNumberParam(searchParams.daysMin),
    daysMax: parseNumberParam(searchParams.daysMax),
    category: parseStringParam(searchParams.category),
    country: parseStringParam(searchParams.country),
    language: parseStringParam(searchParams.language),
    rpmMin: parseNumberParam(searchParams.rpmMin),
    rpmMax: parseNumberParam(searchParams.rpmMax),
    format: parseFormatParam(searchParams.format),
    quality: parseQualityParam(searchParams.quality),
    faces: parseFacesParam(searchParams.faces),
    madeForKids: parseYesNoParam(searchParams.madeForKids),
    syntheticMedia: parseYesNoParam(searchParams.syntheticMedia),
    sort: parseSortParam(searchParams.sort),
    dir: parseDirParam(searchParams.dir),
    page: page && page > 0 ? Math.floor(page) : DEFAULT_FILTERS.page,
  };
}

/**
 * Overrides used to build a link that starts from a base CatalogFilters and
 * changes only some fields. `null` clears a field, `undefined` (i.e. simply
 * omitting the key) keeps the base value.
 */
export type FilterOverrides = {
  q?: string | null;
  subMin?: number | null;
  subMax?: number | null;
  avgMin?: number | null;
  avgMax?: number | null;
  outlierMin?: number | null;
  outlierMax?: number | null;
  videoMin?: number | null;
  videoMax?: number | null;
  daysMin?: number | null;
  daysMax?: number | null;
  category?: string | null;
  country?: string | null;
  language?: string | null;
  rpmMin?: number | null;
  rpmMax?: number | null;
  format?: ChannelFormat | null;
  quality?: ChannelQuality | null;
  faces?: FacesFilter | null;
  madeForKids?: boolean | null;
  syntheticMedia?: boolean | null;
  sort?: SortField;
  dir?: SortDirection;
  page?: number | null;
};

function resolveOverride<T>(overrideValue: T | null | undefined, baseValue: T): T | null {
  return overrideValue === undefined ? baseValue : overrideValue;
}

/**
 * Builds an href for `/` with `base` filters plus `overrides` applied,
 * serialized to URL searchParams. Used by every link that changes filters:
 * presets (start from DEFAULT_FILTERS), quick filter-bucket buttons (start
 * from the current filters, to preserve everything else), and pagination
 * links (start from the current filters, override only `page`).
 */
export function buildCatalogHref(base: CatalogFilters, overrides: FilterOverrides = {}): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | null) => {
    if (value === null || value === "") return;
    params.set(key, String(value));
  };

  put("q", resolveOverride(overrides.q, base.q));
  put("subMin", resolveOverride(overrides.subMin, base.subMin));
  put("subMax", resolveOverride(overrides.subMax, base.subMax));
  put("avgMin", resolveOverride(overrides.avgMin, base.avgMin));
  put("avgMax", resolveOverride(overrides.avgMax, base.avgMax));
  put("outlierMin", resolveOverride(overrides.outlierMin, base.outlierMin));
  put("outlierMax", resolveOverride(overrides.outlierMax, base.outlierMax));
  put("videoMin", resolveOverride(overrides.videoMin, base.videoMin));
  put("videoMax", resolveOverride(overrides.videoMax, base.videoMax));
  put("daysMin", resolveOverride(overrides.daysMin, base.daysMin));
  put("daysMax", resolveOverride(overrides.daysMax, base.daysMax));
  put("category", resolveOverride(overrides.category, base.category));
  put("country", resolveOverride(overrides.country, base.country));
  put("language", resolveOverride(overrides.language, base.language));
  put("rpmMin", resolveOverride(overrides.rpmMin, base.rpmMin));
  put("rpmMax", resolveOverride(overrides.rpmMax, base.rpmMax));
  put("format", resolveOverride(overrides.format, base.format));
  put("quality", resolveOverride(overrides.quality, base.quality));
  put("faces", resolveOverride(overrides.faces, base.faces));

  const putYesNo = (key: string, value: boolean | null) => {
    if (value === null) return;
    params.set(key, value ? "yes" : "no");
  };
  putYesNo("madeForKids", resolveOverride(overrides.madeForKids, base.madeForKids));
  putYesNo("syntheticMedia", resolveOverride(overrides.syntheticMedia, base.syntheticMedia));

  const sort = overrides.sort ?? base.sort;
  const dir = overrides.dir ?? base.dir;
  if (sort !== DEFAULT_FILTERS.sort) put("sort", sort);
  if (dir !== DEFAULT_FILTERS.dir) put("dir", dir);

  const page = resolveOverride(overrides.page, base.page);
  if (page !== null && page > 1) put("page", page);

  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

// ---------------------------------------------------------------------------
// Presets — buttons that fully replace the URL searchParams with a fixed
// filter/sort combo (per spec: "Presets should just set/replace the URL
// searchParams").
// ---------------------------------------------------------------------------

export type CatalogPreset = {
  key: string;
  label: string;
  overrides: FilterOverrides;
};

export const CATALOG_PRESETS: CatalogPreset[] = [
  {
    key: "top-outlier",
    label: "Mayor outlier",
    overrides: { sort: "outlier", dir: "desc" },
  },
  {
    key: "high-avg-new",
    label: "Alto promedio, pocos días desde el inicio",
    overrides: { daysMax: 180, sort: "avgViews", dir: "desc" },
  },
  {
    key: "steady",
    label: "Constantes",
    overrides: { outlierMin: 1, outlierMax: 2, videoMin: 20, sort: "medianViews", dir: "desc" },
  },
  {
    key: "clear",
    label: "Sin filtro",
    overrides: { sort: "firstDiscovered", dir: "desc" },
  },
];

// ---------------------------------------------------------------------------
// Row shape + enrichment
// ---------------------------------------------------------------------------

export type CatalogRow = {
  id: string;
  title: string;
  thumbnailUrl: string;
  dominantCategoryId: string | null;
  country: string | null;
  language: string | null;
  subscriberCount: number;
  avgViewsRecent: number;
  medianViewsRecent: number;
  videoCount: number;
  channelPublishedAt: Date;
  firstDiscoveredAt: Date;
  daysSinceStart: number;
  outlierScore: number | null;
  bucketLabel: string;
  insufficientSample: boolean;
  /** Null when the channel has no dominantCategoryId yet (unclassified) —
   * see src/lib/rpm.ts estimateCategoryRpm. Render "sin datos todavía" for
   * null, never a number. */
  rpm: number | null;
  rpmIsFallback: boolean;
  estimatedMonthlyRevenue: number | null;
  /** Classification fields (Prompt 3). All null until scripts/classify.ts
   * has processed the channel (classifiedAt set) — render "Sin clasificar
   * todavía" for those, never hide the row. */
  format: string | null;
  quality: string | null;
  isFaceless: boolean | null;
  madeForKids: boolean | null;
  containsSyntheticMedia: boolean | null;
};

type ChannelWithLatestSnapshot = {
  id: string;
  title: string;
  thumbnailUrl: string;
  dominantCategoryId: string | null;
  country: string | null;
  defaultLanguage: string | null;
  subscriberCount: number;
  videoCount: number;
  channelPublishedAt: Date;
  firstDiscoveredAt: Date;
  format: string | null;
  quality: string | null;
  isFaceless: boolean | null;
  madeForKids: boolean | null;
  containsSyntheticMedia: boolean | null;
  snapshots: { avgViewsRecent: number; medianViewsRecent: number }[];
};

async function fetchAllChannelsWithLatestSnapshot(
  prisma: PrismaClient,
): Promise<ChannelWithLatestSnapshot[]> {
  return prisma.channel.findMany({
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      dominantCategoryId: true,
      country: true,
      defaultLanguage: true,
      subscriberCount: true,
      videoCount: true,
      channelPublishedAt: true,
      firstDiscoveredAt: true,
      format: true,
      quality: true,
      isFaceless: true,
      madeForKids: true,
      containsSyntheticMedia: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { avgViewsRecent: true, medianViewsRecent: true },
      },
    },
  });
}

type OutlierByChannelId = Map<string, Awaited<ReturnType<typeof computeChannelOutlierScores>>[number]>;

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / MS_PER_DAY));
}

/** Enriches a raw Channel+snapshot row with outlier/rpm/revenue/days-since-start.
 * Returns null for channels with no snapshot yet — same convention as
 * src/lib/outlier.ts, since avgViewsRecent/medianViewsRecent/outlier score
 * are all undefined without at least one snapshot. */
function enrichChannel(
  channel: ChannelWithLatestSnapshot,
  outlierByChannelId: OutlierByChannelId,
): CatalogRow | null {
  const snapshot = channel.snapshots[0];
  if (!snapshot) return null;

  const outlier = outlierByChannelId.get(channel.id);
  const { rpm, isFallback, estimatedMonthlyRevenue } = estimateMonthlyRevenue(
    snapshot.avgViewsRecent,
    channel.dominantCategoryId,
  );

  return {
    id: channel.id,
    title: channel.title,
    thumbnailUrl: channel.thumbnailUrl,
    dominantCategoryId: channel.dominantCategoryId,
    country: channel.country,
    language: channel.defaultLanguage,
    subscriberCount: channel.subscriberCount,
    avgViewsRecent: snapshot.avgViewsRecent,
    medianViewsRecent: snapshot.medianViewsRecent,
    videoCount: channel.videoCount,
    channelPublishedAt: channel.channelPublishedAt,
    firstDiscoveredAt: channel.firstDiscoveredAt,
    daysSinceStart: daysSince(channel.channelPublishedAt),
    outlierScore: outlier?.outlierScore ?? null,
    bucketLabel: outlier?.bucketLabel ?? "",
    insufficientSample: outlier?.insufficientSample ?? true,
    rpm,
    rpmIsFallback: isFallback,
    estimatedMonthlyRevenue,
    format: channel.format,
    quality: channel.quality,
    isFaceless: channel.isFaceless,
    madeForKids: channel.madeForKids,
    containsSyntheticMedia: channel.containsSyntheticMedia,
  };
}

// ---------------------------------------------------------------------------
// Filtering + sorting (in-memory — see design note at the top of the file)
// ---------------------------------------------------------------------------

function matchesFilters(row: CatalogRow, filters: CatalogFilters): boolean {
  if (filters.q && !row.title.toLowerCase().includes(filters.q.toLowerCase())) return false;
  if (filters.subMin != null && row.subscriberCount < filters.subMin) return false;
  if (filters.subMax != null && row.subscriberCount > filters.subMax) return false;
  if (filters.avgMin != null && row.avgViewsRecent < filters.avgMin) return false;
  if (filters.avgMax != null && row.avgViewsRecent > filters.avgMax) return false;
  if (filters.outlierMin != null && (row.outlierScore == null || row.outlierScore < filters.outlierMin)) return false;
  if (filters.outlierMax != null && (row.outlierScore == null || row.outlierScore > filters.outlierMax)) return false;
  if (filters.videoMin != null && row.videoCount < filters.videoMin) return false;
  if (filters.videoMax != null && row.videoCount > filters.videoMax) return false;
  if (filters.daysMin != null && row.daysSinceStart < filters.daysMin) return false;
  if (filters.daysMax != null && row.daysSinceStart > filters.daysMax) return false;
  if (filters.category != null && row.dominantCategoryId !== filters.category) return false;
  if (filters.country != null && row.country !== filters.country) return false;
  if (filters.language != null && row.language !== filters.language) return false;
  if (filters.rpmMin != null && (row.rpm == null || row.rpm < filters.rpmMin)) return false;
  if (filters.rpmMax != null && (row.rpm == null || row.rpm > filters.rpmMax)) return false;
  if (filters.format != null && row.format !== filters.format) return false;
  if (filters.quality != null && row.quality !== filters.quality) return false;
  if (filters.faces === "faceless" && row.isFaceless !== true) return false;
  if (filters.faces === "presenter" && row.isFaceless !== false) return false;
  if (filters.madeForKids != null && row.madeForKids !== filters.madeForKids) return false;
  if (filters.syntheticMedia != null && row.containsSyntheticMedia !== filters.syntheticMedia) return false;
  return true;
}

function extractSortValue(row: CatalogRow, sort: SortField): number | string | null {
  switch (sort) {
    case "outlier":
      return row.outlierScore;
    case "avgViews":
      return row.avgViewsRecent;
    case "medianViews":
      return row.medianViewsRecent;
    case "subscribers":
      return row.subscriberCount;
    case "videoCount":
      return row.videoCount;
    case "daysSinceStart":
      return row.daysSinceStart;
    case "rpm":
      return row.rpm;
    case "revenue":
      return row.estimatedMonthlyRevenue;
    case "firstDiscovered":
      return row.firstDiscoveredAt.getTime();
    case "title":
      return row.title;
  }
}

/** Nulls (e.g. "insufficient sample" outlier scores) always sort to the end,
 * regardless of sort direction, so they never dominate a `desc` sort. */
function compareRows(a: CatalogRow, b: CatalogRow, sort: SortField, dir: SortDirection): number {
  const av = extractSortValue(a, sort);
  const bv = extractSortValue(b, sort);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;

  const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
  return dir === "asc" ? cmp : -cmp;
}

// ---------------------------------------------------------------------------
// "Outliers agregados recientemente" widget
// ---------------------------------------------------------------------------

export type OutlierHighlight = {
  id: string;
  title: string;
  thumbnailUrl: string;
  subscriberCount: number;
  outlierScore: number;
};

function buildOutlierHighlights(rows: CatalogRow[]): OutlierHighlight[] {
  const cutoff = new Date(Date.now() - OUTLIER_HIGHLIGHT_WINDOW_DAYS * MS_PER_DAY);
  return rows
    .filter((row) => row.firstDiscoveredAt >= cutoff && row.outlierScore != null)
    .sort((a, b) => (b.outlierScore as number) - (a.outlierScore as number))
    .slice(0, OUTLIER_HIGHLIGHT_LIMIT)
    .map((row) => ({
      id: row.id,
      title: row.title,
      thumbnailUrl: row.thumbnailUrl,
      subscriberCount: row.subscriberCount,
      outlierScore: row.outlierScore as number,
    }));
}

// ---------------------------------------------------------------------------
// Distinct dropdown values (queried from the DB, never hardcoded)
// ---------------------------------------------------------------------------

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Top-level page data loader
// ---------------------------------------------------------------------------

export type CatalogPageData = {
  rows: CatalogRow[];
  totalMatching: number;
  totalChannels: number;
  page: number;
  totalPages: number;
  distinctCategories: string[];
  distinctCountries: string[];
  distinctLanguages: string[];
  /** Count of ChannelSnapshot rows captured in the last 48h — the header counter. */
  snapshotsLast48h: number;
  highlights: OutlierHighlight[];
};

/**
 * Loads everything the catalog page needs for one request: the header
 * counter, the recent-outliers widget, dropdown option lists, and the
 * filtered/sorted/paginated results table.
 *
 * Calls `computeChannelOutlierScores` exactly ONCE — its result (a
 * channelId -> outlier data map) is reused for both the highlights widget
 * and every row in the table, so bucket medians are never recomputed per
 * row or per widget.
 */
export async function loadCatalogPageData(
  prisma: PrismaClient,
  filters: CatalogFilters,
): Promise<CatalogPageData> {
  const [outlierResults, channels, totalChannels, snapshotsLast48h] = await Promise.all([
    computeChannelOutlierScores(prisma),
    fetchAllChannelsWithLatestSnapshot(prisma),
    prisma.channel.count(),
    prisma.channelSnapshot.count({
      where: { capturedAt: { gte: new Date(Date.now() - RECENT_SNAPSHOT_WINDOW_HOURS * MS_PER_HOUR) } },
    }),
  ]);

  const outlierByChannelId: OutlierByChannelId = new Map(
    outlierResults.map((result) => [result.channelId, result]),
  );

  const allRows = channels
    .map((channel) => enrichChannel(channel, outlierByChannelId))
    .filter((row): row is CatalogRow => row !== null);

  const distinctCategories = uniqueSorted(allRows.map((r) => r.dominantCategoryId));
  const distinctCountries = uniqueSorted(allRows.map((r) => r.country));
  const distinctLanguages = uniqueSorted(allRows.map((r) => r.language));

  const highlights = buildOutlierHighlights(allRows);

  const filteredRows = allRows.filter((row) => matchesFilters(row, filters));
  filteredRows.sort((a, b) => compareRows(a, b, filters.sort, filters.dir));

  const totalMatching = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalMatching / RESULTS_PER_PAGE));
  const safePage = Math.min(Math.max(1, filters.page), totalPages);
  const start = (safePage - 1) * RESULTS_PER_PAGE;
  const rows = filteredRows.slice(start, start + RESULTS_PER_PAGE);

  return {
    rows,
    totalMatching,
    totalChannels,
    page: safePage,
    totalPages,
    distinctCategories,
    distinctCountries,
    distinctLanguages,
    snapshotsLast48h,
    highlights,
  };
}

import { PrismaClient } from "@prisma/client";
import { computeChannelOutlierScores } from "./outlier";

/**
 * Data layer for the Keywords tab (`/keywords`, Prompt 5) — search channels
 * by the tags their own videos already carry (Channel.tags, populated by
 * scripts/discover.ts from snippet.tags on the sampled uploads).
 *
 * Prisma's query builder can't unnest+GROUP BY (tag frequency cloud) or do a
 * case-insensitive per-element match (search) against a String[] column, so
 * both of those use `prisma.$queryRaw` with a tagged template (parameterized,
 * never string concatenation — the search term is user input). Everything
 * else (fetching full channel rows for the matched ids, outlier scoring)
 * goes back through the normal Prisma query builder, same as catalog.ts.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** How many of the most frequent tags to show in the tag cloud. */
export const TOP_TAGS_LIMIT = 30;

export const KEYWORDS_RESULTS_PER_PAGE = 50;

export type TagFrequency = {
  tag: string;
  count: number;
};

/**
 * The 30 most frequent tag values across every channel's `tags` array in
 * the whole catalog. `unnest(tags)` expands each channel's tag array into
 * one row per tag, then we GROUP BY/COUNT/ORDER BY/LIMIT in SQL — Prisma's
 * query builder has no equivalent for unnesting an array column.
 */
export async function fetchTopTags(prisma: PrismaClient): Promise<TagFrequency[]> {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT tag, COUNT(*) as count
    FROM "Channel", unnest("Channel".tags) as tag
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT ${TOP_TAGS_LIMIT}
  `;
  return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}

/**
 * Channel ids whose `tags` array contains at least one tag matching `query`
 * case-insensitively (substring match, e.g. "cook" matches "cooking"). Uses
 * `ILIKE` per unnested tag via EXISTS — Prisma's array filters (`has`/
 * `hasSome`) only do case-sensitive EXACT element matches, not this.
 *
 * Parameterized via $queryRaw's tagged template (never raw string
 * interpolation) so `query` — user input — can't be used for SQL injection.
 */
async function searchChannelIdsByTag(prisma: PrismaClient, query: string): Promise<string[]> {
  const likePattern = `%${query}%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Channel"
    WHERE EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE t ILIKE ${likePattern})
  `;
  return rows.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Row shape + enrichment (mirrors catalog.ts's CatalogRow/enrichChannel for
// the subset of columns this tab shows).
// ---------------------------------------------------------------------------

export type KeywordsRow = {
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
  daysSinceStart: number;
  outlierScore: number | null;
  insufficientSample: boolean;
  tags: string[];
};

type ChannelWithTagsAndLatestSnapshot = {
  id: string;
  title: string;
  thumbnailUrl: string;
  dominantCategoryId: string | null;
  country: string | null;
  defaultLanguage: string | null;
  subscriberCount: number;
  videoCount: number;
  channelPublishedAt: Date;
  tags: string[];
  snapshots: { avgViewsRecent: number; medianViewsRecent: number }[];
};

async function fetchChannelsByIds(
  prisma: PrismaClient,
  ids: string[],
): Promise<ChannelWithTagsAndLatestSnapshot[]> {
  if (ids.length === 0) return [];
  return prisma.channel.findMany({
    where: { id: { in: ids } },
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
      tags: true,
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

/** Returns null for channels with no snapshot yet — same convention as
 * catalog.ts's enrichChannel. */
function enrichKeywordsChannel(
  channel: ChannelWithTagsAndLatestSnapshot,
  outlierByChannelId: OutlierByChannelId,
): KeywordsRow | null {
  const snapshot = channel.snapshots[0];
  if (!snapshot) return null;

  const outlier = outlierByChannelId.get(channel.id);

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
    daysSinceStart: daysSince(channel.channelPublishedAt),
    outlierScore: outlier?.outlierScore ?? null,
    insufficientSample: outlier?.insufficientSample ?? true,
    tags: channel.tags,
  };
}

// ---------------------------------------------------------------------------
// Top-level page data loader
// ---------------------------------------------------------------------------

export type KeywordsPageData = {
  topTags: TagFrequency[];
  query: string | null;
  rows: KeywordsRow[];
  totalMatching: number;
  page: number;
  totalPages: number;
};

function parsePageParam(value: string | string[] | undefined): number {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

/** Shape of Next.js's `searchParams` (App Router page prop, already awaited). */
export type KeywordsSearchParams = Record<string, string | string[] | undefined>;

/**
 * Loads everything the keywords page needs for one request: the top-tags
 * cloud (always computed, independent of the current search) plus, when a
 * search term is present, the matching channels — filtered/sorted/paginated.
 *
 * Only calls computeChannelOutlierScores (a full table scan) when there's
 * actually a search term to enrich, since the tag cloud alone doesn't need it.
 */
export async function loadKeywordsPageData(
  prisma: PrismaClient,
  searchParams: KeywordsSearchParams,
): Promise<KeywordsPageData> {
  const rawQuery = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const query = rawQuery === "" ? null : rawQuery;
  const page = parsePageParam(searchParams.page);

  const topTags = await fetchTopTags(prisma);

  if (query === null) {
    return { topTags, query, rows: [], totalMatching: 0, page: 1, totalPages: 1 };
  }

  const [matchingIds, outlierResults] = await Promise.all([
    searchChannelIdsByTag(prisma, query),
    computeChannelOutlierScores(prisma),
  ]);

  const outlierByChannelId: OutlierByChannelId = new Map(
    outlierResults.map((result) => [result.channelId, result]),
  );

  const channels = await fetchChannelsByIds(prisma, matchingIds);
  const allRows = channels
    .map((channel) => enrichKeywordsChannel(channel, outlierByChannelId))
    .filter((row): row is KeywordsRow => row !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  const totalMatching = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalMatching / KEYWORDS_RESULTS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * KEYWORDS_RESULTS_PER_PAGE;
  const rows = allRows.slice(start, start + KEYWORDS_RESULTS_PER_PAGE);

  return { topTags, query, rows, totalMatching, page: safePage, totalPages };
}

/** Builds an href for `/keywords` with a given search term and page. */
export function buildKeywordsHref(query: string | null, page: number = 1): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/keywords?${qs}` : "/keywords";
}

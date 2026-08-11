import { PrismaClient } from "@prisma/client";

/**
 * Data layer for the `/recientes` page ("Recién agregados"). Lists channels
 * by firstDiscoveredAt descending, with simple language/category filters and
 * URL-searchParams-driven pagination — same pattern as src/lib/catalog.ts.
 */

export const RECENT_RESULTS_PER_PAGE = 50;

export type RecentSearchParams = Record<string, string | string[] | undefined>;

export type RecentFilters = {
  category: string | null;
  language: string | null;
  page: number;
};

export const DEFAULT_RECENT_FILTERS: RecentFilters = {
  category: null,
  language: null,
  page: 1,
};

function parseStringParam(value: string | string[] | undefined): string | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function parseNumberParam(value: string | string[] | undefined): number | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRecentFilters(searchParams: RecentSearchParams): RecentFilters {
  const page = parseNumberParam(searchParams.page);
  return {
    category: parseStringParam(searchParams.category),
    language: parseStringParam(searchParams.language),
    page: page && page > 0 ? Math.floor(page) : DEFAULT_RECENT_FILTERS.page,
  };
}

export type RecentFilterOverrides = {
  category?: string | null;
  language?: string | null;
  page?: number | null;
};

function resolveOverride<T>(overrideValue: T | null | undefined, baseValue: T): T | null {
  return overrideValue === undefined ? baseValue : overrideValue;
}

/** Builds an href for `/recientes` with `base` filters plus `overrides` applied. */
export function buildRecentHref(base: RecentFilters, overrides: RecentFilterOverrides = {}): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | null) => {
    if (value === null || value === "") return;
    params.set(key, String(value));
  };

  put("category", resolveOverride(overrides.category, base.category));
  put("language", resolveOverride(overrides.language, base.language));

  const page = resolveOverride(overrides.page, base.page);
  if (page !== null && page > 1) put("page", page);

  const qs = params.toString();
  return qs ? `/recientes?${qs}` : "/recientes";
}

export type RecentChannel = {
  id: string;
  title: string;
  thumbnailUrl: string;
  dominantCategoryId: string | null;
  defaultLanguage: string | null;
  subscriberCount: number;
  firstDiscoveredAt: Date;
};

export type RecentPageData = {
  rows: RecentChannel[];
  totalMatching: number;
  page: number;
  totalPages: number;
  distinctCategories: string[];
  distinctLanguages: string[];
};

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
}

/**
 * Loads one page of recently-discovered channels plus the distinct dropdown
 * values for the category/language filters. Filtering + pagination happen
 * at the DB level (unlike catalog.ts's in-memory approach) since this page
 * has no derived/computed fields to filter on.
 */
export async function loadRecentPageData(prisma: PrismaClient, filters: RecentFilters): Promise<RecentPageData> {
  const where = {
    ...(filters.category ? { dominantCategoryId: filters.category } : {}),
    ...(filters.language ? { defaultLanguage: filters.language } : {}),
  };

  const [totalMatching, allCategories, allLanguages] = await Promise.all([
    prisma.channel.count({ where }),
    prisma.channel.findMany({ select: { dominantCategoryId: true }, distinct: ["dominantCategoryId"] }),
    prisma.channel.findMany({ select: { defaultLanguage: true }, distinct: ["defaultLanguage"] }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatching / RECENT_RESULTS_PER_PAGE));
  const safePage = Math.min(Math.max(1, filters.page), totalPages);

  const rows = await prisma.channel.findMany({
    where,
    orderBy: { firstDiscoveredAt: "desc" },
    skip: (safePage - 1) * RECENT_RESULTS_PER_PAGE,
    take: RECENT_RESULTS_PER_PAGE,
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      dominantCategoryId: true,
      defaultLanguage: true,
      subscriberCount: true,
      firstDiscoveredAt: true,
    },
  });

  return {
    rows,
    totalMatching,
    page: safePage,
    totalPages,
    distinctCategories: uniqueSorted(allCategories.map((c) => c.dominantCategoryId)),
    distinctLanguages: uniqueSorted(allLanguages.map((l) => l.defaultLanguage)),
  };
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Hand-written Spanish relative-time formatter ("hace 23 minutos", "hace 2
 * días", "hace 5 meses") — no date library dependency. Coarse by design:
 * picks the single largest whole unit that fits, same as most "time ago"
 * UI conventions.
 */
export function formatRelativeTimeEs(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (seconds < MINUTE) return "hace un momento";

  const units: { limit: number; secondsPerUnit: number; singular: string; plural: string }[] = [
    { limit: HOUR, secondsPerUnit: MINUTE, singular: "minuto", plural: "minutos" },
    { limit: DAY, secondsPerUnit: HOUR, singular: "hora", plural: "horas" },
    { limit: MONTH, secondsPerUnit: DAY, singular: "día", plural: "días" },
    { limit: YEAR, secondsPerUnit: MONTH, singular: "mes", plural: "meses" },
    { limit: Infinity, secondsPerUnit: YEAR, singular: "año", plural: "años" },
  ];

  for (const unit of units) {
    if (seconds < unit.limit) {
      const value = Math.floor(seconds / unit.secondsPerUnit);
      const label = value === 1 ? unit.singular : unit.plural;
      return `hace ${value} ${label}`;
    }
  }

  return "hace un momento";
}

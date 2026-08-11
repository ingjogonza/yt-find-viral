import { prisma } from "@/lib/prisma";
import { computeChannelOutlierScores } from "@/lib/outlier";
import { estimateMonthlyRevenue } from "@/lib/rpm";
import { getFavoriteChannelIds } from "@/lib/favorites";
import type { CatalogRow } from "@/lib/catalog";
import { ResultsTable } from "../_components/ResultsTable";

// This page reads no searchParams, so Next would otherwise prerender it
// once at build time and freeze the favorites list — force per-request
// dynamic rendering, same as every other page in this app.
export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / MS_PER_DAY));
}

/**
 * Builds CatalogRow[] scoped to favorited channels only. Deliberately NOT
 * reusing catalog.ts's private fetchAllChannelsWithLatestSnapshot/
 * enrichChannel (unexported, and this prompt's scope is "read outlier.ts
 * and rpm.ts, don't modify catalog.ts") — this mirrors that same
 * meta+snapshot+outlier+rpm shaping, just scoped to `id: { in: favoriteIds }`.
 */
async function loadFavoritesRows(): Promise<CatalogRow[]> {
  const favoriteChannelIds = await getFavoriteChannelIds(prisma);
  if (favoriteChannelIds.size === 0) return [];

  const idList = [...favoriteChannelIds];

  const [channels, outlierResults] = await Promise.all([
    prisma.channel.findMany({
      where: { id: { in: idList } },
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
    }),
    computeChannelOutlierScores(prisma),
  ]);

  const outlierByChannelId = new Map(outlierResults.map((r) => [r.channelId, r]));

  return channels
    .map((channel): CatalogRow | null => {
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
    })
    .filter((row): row is CatalogRow => row !== null)
    .sort((a, b) => b.firstDiscoveredAt.getTime() - a.firstDiscoveredAt.getTime());
}

export default async function FavoritesPage() {
  const rows = await loadFavoritesRows();
  const favoriteChannelIds = new Set(rows.map((r) => r.id));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Favoritos</h1>
        <p className="mt-1 text-sm text-gray-600">
          Canales que marcaste con ★ desde cualquier vista. Hacé click en la estrella para quitarlos de acá.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Todavía no marcaste ningún canal como favorito. Hacé click en la ★ en cualquier tabla del catálogo.
        </p>
      ) : (
        <ResultsTable rows={rows} favoriteChannelIds={favoriteChannelIds} />
      )}
    </main>
  );
}

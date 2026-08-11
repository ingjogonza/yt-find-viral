import { prisma } from "@/lib/prisma";
import { parseRecentFilters, loadRecentPageData, type RecentSearchParams } from "@/lib/recent";
import { getFavoriteChannelIds } from "@/lib/favorites";
import { RecentFilterForm } from "./_components/RecentFilterForm";
import { RecentResultsTable } from "./_components/RecentResultsTable";
import { RecentPagination } from "./_components/RecentPagination";

// Reading searchParams opts this page into per-request dynamic rendering —
// filters/page live in the URL and every request re-queries our own DB via
// Prisma (never the YouTube API).
export default async function RecentPage({
  searchParams,
}: {
  searchParams: Promise<RecentSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseRecentFilters(resolvedSearchParams);
  const [data, favoriteChannelIds] = await Promise.all([
    loadRecentPageData(prisma, filters),
    getFavoriteChannelIds(prisma),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Recién agregados</h1>
        <p className="mt-1 text-sm text-gray-600">Canales ordenados por fecha de descubrimiento, más nuevos primero.</p>
      </header>

      <RecentFilterForm
        filters={filters}
        distinctCategories={data.distinctCategories}
        distinctLanguages={data.distinctLanguages}
      />

      <RecentResultsTable rows={data.rows} favoriteChannelIds={favoriteChannelIds} />

      <RecentPagination
        filters={filters}
        page={data.page}
        totalPages={data.totalPages}
        totalMatching={data.totalMatching}
      />
    </main>
  );
}

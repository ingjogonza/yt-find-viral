import { prisma } from "@/lib/prisma";
import { parseCatalogFilters, loadCatalogPageData, type CatalogSearchParams } from "@/lib/catalog";
import { getFavoriteChannelIds } from "@/lib/favorites";
import { FilterForm } from "./_components/FilterForm";
import { PresetBar } from "./_components/PresetBar";
import { OutlierHighlights } from "./_components/OutlierHighlights";
import { ResultsTable } from "./_components/ResultsTable";
import { Pagination } from "./_components/Pagination";

// Reading searchParams opts this page into per-request dynamic rendering,
// which is what we want: filters/sort/page all live in the URL and every
// request re-queries our own DB via Prisma (never the YouTube API).
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseCatalogFilters(resolvedSearchParams);
  const [data, favoriteChannelIds] = await Promise.all([
    loadCatalogPageData(prisma, filters),
    getFavoriteChannelIds(prisma),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Catálogo de canales de YouTube</h1>
        <p className="mt-1 text-sm text-gray-600">
          {data.snapshotsLast48h.toLocaleString("es-ES")} canales analizados en las últimas 48 horas
        </p>
      </header>

      <OutlierHighlights highlights={data.highlights} />

      <PresetBar />

      <FilterForm
        filters={filters}
        totalChannels={data.totalChannels}
        distinctCategories={data.distinctCategories}
        distinctCountries={data.distinctCountries}
        distinctLanguages={data.distinctLanguages}
      />

      <ResultsTable rows={data.rows} favoriteChannelIds={favoriteChannelIds} />

      <Pagination
        filters={filters}
        page={data.page}
        totalPages={data.totalPages}
        totalMatching={data.totalMatching}
      />
    </main>
  );
}

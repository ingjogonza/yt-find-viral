import { prisma } from "@/lib/prisma";
import { parseShortsFilters, loadShortsPageData, type ShortsSearchParams } from "@/lib/shorts";
import { getFavoriteChannelIds } from "@/lib/favorites";
import { ShortsFilterForm } from "./_components/ShortsFilterForm";
import { ShortsResultsTable } from "./_components/ShortsResultsTable";
import { ShortsPagination } from "./_components/ShortsPagination";

// Reading searchParams opts this page into per-request dynamic rendering,
// same as the main catalog page — filters/page live in the URL and every
// request re-queries our own DB via Prisma.
export default async function ShortsPage({
  searchParams,
}: {
  searchParams: Promise<ShortsSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseShortsFilters(resolvedSearchParams);
  const [data, favoriteChannelIds] = await Promise.all([
    loadShortsPageData(prisma, filters),
    getFavoriteChannelIds(prisma),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Shorts</h1>
        <p className="mt-1 text-sm text-gray-600">
          Canales que suben contenido short-form, con sus propias métricas de vistas y outlier score.
        </p>
      </header>

      <ShortsFilterForm
        filters={filters}
        totalShortsChannels={data.totalShortsChannels}
        distinctCategories={data.distinctCategories}
        distinctCountries={data.distinctCountries}
        distinctLanguages={data.distinctLanguages}
      />

      <ShortsResultsTable rows={data.rows} favoriteChannelIds={favoriteChannelIds} />

      <ShortsPagination
        filters={filters}
        page={data.page}
        totalPages={data.totalPages}
        totalMatching={data.totalMatching}
      />
    </main>
  );
}

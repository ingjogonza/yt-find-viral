import { prisma } from "@/lib/prisma";
import { loadKeywordsPageData, type KeywordsSearchParams } from "@/lib/keywords";
import { getFavoriteChannelIds } from "@/lib/favorites";
import { KeywordsSearchForm } from "./_components/KeywordsSearchForm";
import { KeywordsResultsTable } from "./_components/KeywordsResultsTable";
import { KeywordsPagination } from "./_components/KeywordsPagination";

// Reading searchParams opts this page into per-request dynamic rendering,
// same as the rest of the app — the search term lives in the URL (?q=...)
// so results are shareable/bookmarkable and chip clicks are plain links.
export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<KeywordsSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const [data, favoriteChannelIds] = await Promise.all([
    loadKeywordsPageData(prisma, resolvedSearchParams),
    getFavoriteChannelIds(prisma),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Keywords</h1>
        <p className="mt-1 text-sm text-gray-600">
          Buscá canales por los tags que ya traen sus propios vídeos.
        </p>
      </header>

      <KeywordsSearchForm query={data.query} topTags={data.topTags} />

      <KeywordsResultsTable rows={data.rows} query={data.query} favoriteChannelIds={favoriteChannelIds} />

      <KeywordsPagination
        query={data.query}
        page={data.page}
        totalPages={data.totalPages}
        totalMatching={data.totalMatching}
      />
    </main>
  );
}

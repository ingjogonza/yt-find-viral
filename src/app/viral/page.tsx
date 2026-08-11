import { prisma } from "@/lib/prisma";
import { loadViralChannels, shuffleSeeded, VIRAL_BATCH_SIZE } from "@/lib/viral";
import { getFavoriteChannelIds } from "@/lib/favorites";
import { SurpriseButton } from "./_components/SurpriseButton";
import { ViralCard } from "./_components/ViralCard";

type ViralSearchParams = { seed?: string | string[] };

/** Default seed used when no `?seed=` is present (first visit / direct link). */
const DEFAULT_SEED = 1;

function parseSeed(searchParams: ViralSearchParams): number {
  const raw = typeof searchParams.seed === "string" ? searchParams.seed : undefined;
  if (raw === undefined) return DEFAULT_SEED;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SEED;
}

// Reading searchParams (the seed) opts this page into per-request dynamic
// rendering — every request re-queries our own DB via Prisma, never the
// YouTube API.
export default async function ViralPage({
  searchParams,
}: {
  searchParams: Promise<ViralSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const seed = parseSeed(resolvedSearchParams);

  const [channels, favoriteChannelIds] = await Promise.all([
    loadViralChannels(prisma),
    getFavoriteChannelIds(prisma),
  ]);
  const batch = shuffleSeeded(channels, seed).slice(0, VIRAL_BATCH_SIZE);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Viral en canales chicos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Canales con menos de 10.000 suscriptores cuya última toma de datos muestra más de 100.000 vistas
            promedio, capturada en los últimos 30 días.
          </p>
        </div>
        <SurpriseButton />
      </header>

      {batch.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Todavía no hay canales que cumplan este criterio. Corré scripts/discover.ts unas cuantas veces más para
          poblar el catálogo.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {batch.map((channel) => (
            <ViralCard key={channel.id} channel={channel} isFavorite={favoriteChannelIds.has(channel.id)} />
          ))}
        </ul>
      )}
    </main>
  );
}

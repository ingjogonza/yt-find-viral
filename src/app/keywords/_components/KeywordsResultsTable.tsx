import { categoryLabel } from "@/lib/rpm";
import type { KeywordsRow } from "@/lib/keywords";
import { FavoriteButton } from "@/app/_components/FavoriteButton";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function formatOutlier(row: KeywordsRow): string {
  if (row.insufficientSample || row.outlierScore == null) return "muestra insuficiente";
  return `${row.outlierScore.toFixed(1)}x`;
}

type KeywordsResultsTableProps = {
  rows: KeywordsRow[];
  query: string | null;
  favoriteChannelIds: Set<string>;
};

/** Results table for the Keywords tab — same visual language as the main
 * catalog's ResultsTable (src/app/_components/ResultsTable.tsx), plus a
 * Tags column so it's clear which of the channel's tags matched. */
export function KeywordsResultsTable({ rows, query, favoriteChannelIds }: KeywordsResultsTableProps) {
  if (query === null) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        Escribí un tag arriba, o hacé click en uno de los chips, para buscar canales.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        Ningún canal tiene un tag que coincida con &quot;{query}&quot;.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
              <th className="px-3 py-2">
                <span className="sr-only">Favorito</span>
              </th>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">País</th>
              <th className="px-3 py-2">Idioma</th>
              <th className="px-3 py-2 text-right">Suscriptores</th>
              <th className="px-3 py-2 text-right">Vistas prom.</th>
              <th className="px-3 py-2 text-right">Vistas mediana</th>
              <th className="px-3 py-2 text-right">Nº vídeos</th>
              <th className="px-3 py-2 text-right">Outlier</th>
              <th className="px-3 py-2 text-right">Días desde inicio</th>
              <th className="px-3 py-2">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <FavoriteButton channelId={row.id} isFavorite={favoriteChannelIds.has(row.id)} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>
                        avoids configuring next/image remote-domain allowlisting for
                        YouTube's thumbnail hosts, out of scope for this prompt. */}
                    <img
                      src={row.thumbnailUrl}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <span className="font-medium text-gray-900">{row.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-600">{categoryLabel(row.dominantCategoryId)}</td>
                <td className="px-3 py-2 text-gray-600">{row.country ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">{row.language ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.subscriberCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.avgViewsRecent)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.medianViewsRecent)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.videoCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatOutlier(row)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.daysSinceStart)}</td>
                <td className="px-3 py-2 text-gray-600">
                  <span className="line-clamp-2 max-w-xs">{row.tags.join(", ") || "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

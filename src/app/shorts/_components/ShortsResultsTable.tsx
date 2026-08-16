import { categoryLabel } from "@/lib/rpm";
import type { ShortsRow } from "@/lib/shorts";
import { FavoriteButton } from "@/app/_components/FavoriteButton";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function formatOutlier(row: ShortsRow): string {
  if (row.insufficientSample || row.outlierScore == null) return "muestra insuficiente";
  return `${row.outlierScore.toFixed(1)}x`;
}

type ShortsResultsTableProps = {
  rows: ShortsRow[];
  favoriteChannelIds: Set<string>;
};

/** Results table for the Shorts tab — same visual language as the main
 * catalog's ResultsTable (src/app/_components/ResultsTable.tsx), with
 * shorts-specific columns instead of the long-video ones. */
export function ShortsResultsTable({ rows, favoriteChannelIds }: ShortsResultsTableProps) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No hay canales con shorts que coincidan con estos filtros. Probá quitando algún filtro, o corré
        scripts/discover.ts para poblar más datos de shorts.
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
              <th className="px-3 py-2">País</th>
              <th className="px-3 py-2">Idioma</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2 text-right">Suscriptores</th>
              <th className="px-3 py-2 text-right">Shorts muestreados</th>
              <th className="px-3 py-2 text-right">Vistas prom. shorts</th>
              <th className="px-3 py-2 text-right">Vistas mediana shorts</th>
              <th className="px-3 py-2 text-right">Outlier (shorts)</th>
              <th className="px-3 py-2 text-right">Días desde inicio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <FavoriteButton channelId={row.id} isFavorite={favoriteChannelIds.has(row.id)} />
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`https://www.youtube.com/channel/${row.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:underline"
                  >
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
                  </a>
                </td>
                <td className="px-3 py-2 text-gray-600">{row.country ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">{row.language ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">{categoryLabel(row.dominantCategoryId)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.subscriberCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.totalShortsInSample)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.avgShortsViews)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.medianShortsViews)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatOutlier(row)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.daysSinceStart)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

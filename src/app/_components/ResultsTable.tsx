import { categoryLabel, REVENUE_ESTIMATE_DISCLAIMER_ES } from "@/lib/rpm";
import { channelFormatLabel, channelQualityLabel, NOT_YET_CLASSIFIED_LABEL_ES } from "@/lib/classification";
import type { CatalogRow } from "@/lib/catalog";
import { FavoriteButton } from "./FavoriteButton";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatOutlier(row: CatalogRow): string {
  if (row.insufficientSample || row.outlierScore == null) return "muestra insuficiente";
  return `${row.outlierScore.toFixed(1)}x`;
}

/** "Sin clasificar todavía" for null (not yet classified by scripts/classify.ts). */
function formatFaces(isFaceless: boolean | null): string {
  if (isFaceless == null) return NOT_YET_CLASSIFIED_LABEL_ES;
  return isFaceless ? "Faceless" : "Con presentador";
}

/** "Sin clasificar todavía" only applies to format/quality/isFaceless (from
 * scripts/classify.ts). madeForKids/containsSyntheticMedia come straight
 * from the YouTube API (scripts/discover.ts) and are simply "—" when
 * unknown — a different, older null case (e.g. rows refreshed before this
 * field existed), not "not yet classified". */
function formatYesNoUnknown(value: boolean | null): string {
  if (value == null) return "—";
  return value ? "Sí" : "No";
}

type ResultsTableProps = {
  rows: CatalogRow[];
  favoriteChannelIds: Set<string>;
};

/**
 * The main catalog results table. Every RPM/revenue figure is an ESTIMATE
 * (see src/lib/rpm.ts) — column headers say "est." and a disclaimer is
 * rendered directly below the table, right next to those two columns.
 *
 * Also the table /favoritos reuses as-is ("mismo formato de tabla que la
 * página principal") — there, every row's FavoriteButton renders
 * isFavorite=true, so the same star toggle doubles as "quitar de favoritos".
 */
export function ResultsTable({ rows, favoriteChannelIds }: ResultsTableProps) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No hay canales que coincidan con estos filtros. Probá con un preset más amplio o quitá algún filtro.
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
              <th className="px-3 py-2 text-right">RPM est.</th>
              <th className="px-3 py-2 text-right">Ingreso mensual est.</th>
              <th className="px-3 py-2">Formato</th>
              <th className="px-3 py-2">Calidad</th>
              <th className="px-3 py-2">Faces / Faceless</th>
              <th className="px-3 py-2">Para niños</th>
              <th className="px-3 py-2">Contenido sintético / IA</th>
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
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.rpm != null ? (
                    <>
                      {formatCurrency(row.rpm)}
                      {row.rpmIsFallback && <span className="ml-1 text-xs text-gray-400">(prom.)</span>}
                    </>
                  ) : (
                    <span className="text-gray-400">Sin datos todavía</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.estimatedMonthlyRevenue != null ? formatCurrency(row.estimatedMonthlyRevenue) : "—"}
                </td>
                <td className="px-3 py-2 text-gray-600">{channelFormatLabel(row.format)}</td>
                <td className="px-3 py-2 text-gray-600">{channelQualityLabel(row.quality)}</td>
                <td className="px-3 py-2 text-gray-600">{formatFaces(row.isFaceless)}</td>
                <td className="px-3 py-2 text-gray-600">{formatYesNoUnknown(row.madeForKids)}</td>
                <td className="px-3 py-2 text-gray-600">{formatYesNoUnknown(row.containsSyntheticMedia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        RPM y ganancia mensual son estimaciones calculadas con una tabla de RPM editable por categoría (ver
        src/lib/rpm.ts). {REVENUE_ESTIMATE_DISCLAIMER_ES}
      </p>
    </div>
  );
}

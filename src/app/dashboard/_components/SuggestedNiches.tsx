import Link from "next/link";
import { categoryLabel } from "@/lib/rpm";
import { buildCatalogHref, DEFAULT_FILTERS } from "@/lib/catalog";
import type { SuggestedNiche } from "@/lib/dashboard";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function formatScore(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * Categories with >= MIN_CHANNELS_FOR_NICHE channels (in the active scope),
 * ranked by niche_score. Clicking a category reuses the same
 * buildCatalogHref(DEFAULT_FILTERS, { category }) pattern /saturacion
 * already uses to link into the main catalog pre-filtered.
 */
export function SuggestedNiches({ niches }: { niches: SuggestedNiche[] }) {
  if (niches.length === 0) {
    return (
      <p className="mb-8 rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        Todavía no hay categorías con al menos 3 canales en este alcance. Corré scripts/discover.ts y
        scripts/classify.ts unas cuantas veces más para poblar el catálogo.
      </p>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Nichos sugeridos</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2 text-right">Canales outlier</th>
              <th className="px-3 py-2 text-right">Outlier score prom.</th>
              <th className="px-3 py-2 text-right">RPM est. prom.</th>
              <th className="px-3 py-2 text-right">Niche score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {niches.map((niche) => (
              <tr key={niche.categoryId}>
                <td className="px-3 py-2">
                  <Link
                    href={buildCatalogHref(DEFAULT_FILTERS, { category: niche.categoryId })}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {categoryLabel(niche.categoryId)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(niche.outlierChannelCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatScore(niche.avgOutlierScore)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {niche.avgEstimatedRpm != null ? formatCurrency(niche.avgEstimatedRpm) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatScore(niche.nicheScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

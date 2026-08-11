import type { OutlierHighlight } from "@/lib/catalog";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

type OutlierHighlightsProps = {
  highlights: OutlierHighlight[];
};

/**
 * "Outliers agregados recientemente" widget: top channels by outlier score
 * among those discovered in the last 7 days. Independent of the table's
 * filters — always shows the freshest outliers regardless of what the user
 * is currently searching/filtering for.
 */
export function OutlierHighlights({ highlights }: OutlierHighlightsProps) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900">Outliers agregados recientemente</h2>
      <p className="mt-1 text-sm text-gray-600">
        Canales con mayor outlier score entre los descubiertos en los últimos 7 días.
      </p>

      {highlights.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
          Todavía no hay suficientes datos para mostrar outliers recientes. Corré scripts/discover.ts unas cuantas
          veces más para poblar el catálogo.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {highlights.map((highlight) => (
            <li key={highlight.id} className="rounded-md border border-gray-200 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>
                  avoids configuring next/image remote-domain allowlisting for
                  YouTube's thumbnail hosts, out of scope for this prompt. */}
              <img
                src={highlight.thumbnailUrl}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                className="h-12 w-12 rounded-full object-cover"
              />
              <p className="mt-2 truncate text-sm font-medium text-gray-900" title={highlight.title}>
                {highlight.title}
              </p>
              <p className="text-xs text-gray-500">{formatNumber(highlight.subscriberCount)} suscriptores</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">
                {highlight.outlierScore.toFixed(1)}x outlier
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

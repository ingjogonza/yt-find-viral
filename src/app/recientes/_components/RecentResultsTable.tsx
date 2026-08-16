import { categoryLabel } from "@/lib/rpm";
import { formatRelativeTimeEs, type RecentChannel } from "@/lib/recent";
import { FavoriteButton } from "@/app/_components/FavoriteButton";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

type RecentResultsTableProps = {
  rows: RecentChannel[];
  favoriteChannelIds: Set<string>;
};

export function RecentResultsTable({ rows, favoriteChannelIds }: RecentResultsTableProps) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No hay canales que coincidan con estos filtros. Probá quitando algún filtro.
      </p>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
            <th className="px-3 py-2">
              <span className="sr-only">Favorito</span>
            </th>
            <th className="px-3 py-2">Canal</th>
            <th className="px-3 py-2">Categoría</th>
            <th className="px-3 py-2">Idioma</th>
            <th className="px-3 py-2 text-right">Suscriptores</th>
            <th className="px-3 py-2">Agregado</th>
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
              <td className="px-3 py-2 text-gray-600">{categoryLabel(row.dominantCategoryId)}</td>
              <td className="px-3 py-2 text-gray-600">{row.defaultLanguage ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.subscriberCount)}</td>
              <td className="px-3 py-2 text-gray-600">{formatRelativeTimeEs(row.firstDiscoveredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

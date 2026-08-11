import Link from "next/link";
import { buildShortsHref, type ShortsFilters } from "@/lib/shorts";

type ShortsPaginationProps = {
  filters: ShortsFilters;
  page: number;
  totalPages: number;
  totalMatching: number;
};

/** Same pattern as the main catalog's Pagination (src/app/_components/Pagination.tsx). */
export function ShortsPagination({ filters, page, totalPages, totalMatching }: ShortsPaginationProps) {
  if (totalPages <= 1) {
    return (
      <p className="mt-4 text-sm text-gray-500">
        {totalMatching.toLocaleString("es-ES")} canales encontrados.
      </p>
    );
  }

  const prevHref = page > 1 ? buildShortsHref(filters, { page: page - 1 }) : null;
  const nextHref = page < totalPages ? buildShortsHref(filters, { page: page + 1 }) : null;

  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginación de resultados">
      <p className="text-gray-500">
        Página {page} de {totalPages} · {totalMatching.toLocaleString("es-ES")} canales encontrados
      </p>
      <div className="flex gap-2">
        {prevHref ? (
          <Link href={prevHref} className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50">
            Anterior
          </Link>
        ) : (
          <span className="rounded-md border border-gray-200 px-3 py-1.5 text-gray-300">Anterior</span>
        )}
        {nextHref ? (
          <Link href={nextHref} className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50">
            Siguiente
          </Link>
        ) : (
          <span className="rounded-md border border-gray-200 px-3 py-1.5 text-gray-300">Siguiente</span>
        )}
      </div>
    </nav>
  );
}

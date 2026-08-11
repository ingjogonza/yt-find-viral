import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildCatalogHref, DEFAULT_FILTERS } from "@/lib/catalog";
import { categoryLabel } from "@/lib/rpm";
import { loadCategorySaturation, SATURATION_DISCLAIMER_ES } from "@/lib/saturation";

// This page reads no searchParams, so Next would otherwise statically
// prerender it at build time and freeze the saturation numbers as of that
// build. Force per-request dynamic rendering so it always reflects the
// current DB state, same as every other page in this app.
export const dynamic = "force-dynamic";

export default async function SaturationPage() {
  const categories = await loadCategorySaturation(prisma);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Riesgo de saturación</h1>
        <p className="mt-1 text-sm text-gray-600">
          Estas categorías están sumando canales nuevos más rápido que el resto de tu catálogo, probablemente
          porque más gente ya las está mirando.
        </p>
      </header>

      <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{SATURATION_DISCLAIMER_ES}</p>

      {categories.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Todavía no hay canales clasificados con categoría. Corré scripts/discover.ts y scripts/classify.ts unas
          cuantas veces más para poblar el catálogo.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2 text-right">Canales nuevos (últimos 90 días)</th>
                <th className="px-3 py-2 text-right">Total en catálogo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((category) => (
                <tr key={category.categoryId}>
                  <td className="px-3 py-2">
                    <Link
                      href={buildCatalogHref(DEFAULT_FILTERS, { category: category.categoryId })}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {categoryLabel(category.categoryId)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{category.saturationSignal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{category.totalChannels}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

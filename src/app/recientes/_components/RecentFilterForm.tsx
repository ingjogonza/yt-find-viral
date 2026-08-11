import Link from "next/link";
import Form from "next/form";
import { categoryLabel } from "@/lib/rpm";
import type { RecentFilters } from "@/lib/recent";

type RecentFilterFormProps = {
  filters: RecentFilters;
  distinctCategories: string[];
  distinctLanguages: string[];
};

/**
 * `/recientes`'s filter panel: category + language only, per spec ("nada
 * más"). Same native GET-form-to-`""`-action pattern as the catalog's
 * FilterForm — the URL is the only source of truth, no client filter state.
 */
export function RecentFilterForm({ filters, distinctCategories, distinctLanguages }: RecentFilterFormProps) {
  return (
    <section className="mb-8 rounded-lg border border-gray-200 p-4">
      <Form action="" className="space-y-4">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ya prefiltramos los canales que entran a tu catálogo — no combines demasiados filtros específicos a la
          vez, mejor usa un preset amplio y scrollea los resultados.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-md">
          <fieldset className="rounded-md border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Categoría</legend>
            <label htmlFor="category" className="sr-only">
              Categoría
            </label>
            <select
              id="category"
              name="category"
              defaultValue={filters.category ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Todas las categorías</option>
              {distinctCategories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="rounded-md border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Idioma</legend>
            <label htmlFor="language" className="sr-only">
              Idioma
            </label>
            <select
              id="language"
              name="language"
              defaultValue={filters.language ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Todos los idiomas</option>
              {distinctLanguages.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </fieldset>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Aplicar filtros
          </button>
          <Link href="/recientes" className="text-sm text-gray-500 hover:text-gray-700">
            Limpiar filtros
          </Link>
        </div>
      </Form>
    </section>
  );
}

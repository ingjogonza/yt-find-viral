import Link from "next/link";
import Form from "next/form";
import { type ShortsFilters } from "@/lib/shorts";
import { categoryLabel } from "@/lib/rpm";
import { RangeField } from "@/app/_components/RangeField";

type ShortsFilterFormProps = {
  filters: ShortsFilters;
  totalShortsChannels: number;
  distinctCategories: string[];
  distinctCountries: string[];
  distinctLanguages: string[];
};

/**
 * Filter panel for the Shorts tab. Same pattern as the main catalog's
 * FilterForm (src/app/_components/FilterForm.tsx): a single native GET form
 * (next/form, action="") — the URL is the only source of truth, no
 * client-only filter state.
 */
export function ShortsFilterForm({
  filters,
  totalShortsChannels,
  distinctCategories,
  distinctCountries,
  distinctLanguages,
}: ShortsFilterFormProps) {
  return (
    <section className="mb-8 rounded-lg border border-gray-200 p-4">
      <Form action="" className="space-y-4">
        <p className="text-sm text-gray-600">
          {totalShortsChannels.toLocaleString("es-ES")} canales con shorts detectados en tu catálogo.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeField
            legend="Vistas promedio de shorts"
            minName="avgMin"
            maxName="avgMax"
            minValue={filters.avgMin}
            maxValue={filters.avgMax}
          />
          <RangeField
            legend="Suscriptores"
            minName="subMin"
            maxName="subMax"
            minValue={filters.subMin}
            maxValue={filters.subMax}
          />
          <RangeField
            legend="Outlier score (shorts)"
            minName="outlierMin"
            maxName="outlierMax"
            minValue={filters.outlierMin}
            maxValue={filters.outlierMax}
            step={0.1}
          />

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
            <legend className="px-1 text-sm font-medium text-gray-700">País</legend>
            <label htmlFor="country" className="sr-only">
              País
            </label>
            <select
              id="country"
              name="country"
              defaultValue={filters.country ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Todos los países</option>
              {distinctCountries.map((country) => (
                <option key={country} value={country}>
                  {country}
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
          <Link href="/shorts" className="text-sm text-gray-500 hover:text-gray-700">
            Limpiar filtros
          </Link>
        </div>
      </Form>
    </section>
  );
}

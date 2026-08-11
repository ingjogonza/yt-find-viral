import Link from "next/link";
import Form from "next/form";
import { buildCatalogHref, type CatalogFilters } from "@/lib/catalog";
import { categoryLabel } from "@/lib/rpm";
import { CHANNEL_FORMATS, CHANNEL_FORMAT_LABELS_ES, CHANNEL_QUALITIES, CHANNEL_QUALITY_LABELS_ES } from "@/lib/classification";
import { RangeField } from "./RangeField";
import { RadioToggleField } from "./RadioToggleField";

type FilterFormProps = {
  filters: CatalogFilters;
  totalChannels: number;
  distinctCategories: string[];
  distinctCountries: string[];
  distinctLanguages: string[];
};

const VIDEO_COUNT_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: "1–12", min: 1, max: 12 },
  { label: "12–55", min: 12, max: 55 },
  { label: "55+", min: 55, max: null },
];

const DAYS_SINCE_START_PRESETS: { label: string; days: number }[] = [
  { label: "Últimos 30 días", days: 30 },
  { label: "Últimos 90 días", days: 90 },
  { label: "Últimos 180 días", days: 180 },
];

/**
 * The catalog's filter panel. A single native GET form (via next/form,
 * action="") — submitting it re-navigates to `/` with the form's fields
 * encoded as searchParams, which is also how every other part of the page
 * (presets, quick buckets, pagination) communicates state. No client JS,
 * no client-only filter state: the URL is the only source of truth.
 */
export function FilterForm({
  filters,
  totalChannels,
  distinctCategories,
  distinctCountries,
  distinctLanguages,
}: FilterFormProps) {
  return (
    <section className="mb-8 rounded-lg border border-gray-200 p-4">
      <Form action="" className="space-y-4">
        <div>
          <label htmlFor="q" className="block text-sm font-medium text-gray-700">
            Buscar por nombre de canal
          </label>
          <input
            type="search"
            id="q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={`Buscar en tu catálogo de ${totalChannels.toLocaleString("es-ES")} canales...`}
            className="mt-1 block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ya prefiltramos los canales que entran a tu catálogo — no combines demasiados filtros específicos a la
          vez, mejor usa un preset amplio y scrollea los resultados.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeField
            legend="Suscriptores"
            minName="subMin"
            maxName="subMax"
            minValue={filters.subMin}
            maxValue={filters.subMax}
          />
          <RangeField
            legend="Vistas promedio recientes"
            minName="avgMin"
            maxName="avgMax"
            minValue={filters.avgMin}
            maxValue={filters.avgMax}
          />
          <RangeField
            legend="Outlier score"
            minName="outlierMin"
            maxName="outlierMax"
            minValue={filters.outlierMin}
            maxValue={filters.outlierMax}
            step={0.1}
          />
          <RangeField
            legend="RPM estimado (USD)"
            minName="rpmMin"
            maxName="rpmMax"
            minValue={filters.rpmMin}
            maxValue={filters.rpmMax}
            step={0.5}
          />

          <fieldset className="rounded-md border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Nº de vídeos</legend>
            <div className="mb-2 flex flex-wrap gap-1">
              {VIDEO_COUNT_BUCKETS.map((bucket) => (
                <Link
                  key={bucket.label}
                  href={buildCatalogHref(filters, { videoMin: bucket.min, videoMax: bucket.max, page: null })}
                  className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {bucket.label}
                </Link>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="videoMin" className="block text-xs text-gray-500">
                  Mín.
                </label>
                <input
                  type="number"
                  id="videoMin"
                  name="videoMin"
                  min={0}
                  defaultValue={filters.videoMin ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="videoMax" className="block text-xs text-gray-500">
                  Máx.
                </label>
                <input
                  type="number"
                  id="videoMax"
                  name="videoMax"
                  min={0}
                  defaultValue={filters.videoMax ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Días desde el inicio del canal</legend>
            <div className="mb-2 flex flex-wrap gap-1">
              {DAYS_SINCE_START_PRESETS.map((preset) => (
                <Link
                  key={preset.label}
                  href={buildCatalogHref(filters, { daysMin: null, daysMax: preset.days, page: null })}
                  className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {preset.label}
                </Link>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="daysMin" className="block text-xs text-gray-500">
                  Mín.
                </label>
                <input
                  type="number"
                  id="daysMin"
                  name="daysMin"
                  min={0}
                  defaultValue={filters.daysMin ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="daysMax" className="block text-xs text-gray-500">
                  Máx.
                </label>
                <input
                  type="number"
                  id="daysMax"
                  name="daysMax"
                  min={0}
                  defaultValue={filters.daysMax ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </fieldset>

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

          <fieldset className="rounded-md border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Formato</legend>
            <label htmlFor="format" className="sr-only">
              Formato
            </label>
            <select
              id="format"
              name="format"
              defaultValue={filters.format ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Todos los formatos</option>
              {CHANNEL_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {CHANNEL_FORMAT_LABELS_ES[format]}
                </option>
              ))}
            </select>
          </fieldset>

          <RadioToggleField
            legend="Calidad"
            name="quality"
            selectedValue={filters.quality}
            options={CHANNEL_QUALITIES.map((quality) => ({
              value: quality,
              label: CHANNEL_QUALITY_LABELS_ES[quality],
            }))}
          />

          <RadioToggleField
            legend="Faces / Faceless"
            name="faces"
            selectedValue={filters.faces}
            options={[
              { value: "faceless", label: "Solo faceless" },
              { value: "presenter", label: "Solo con presentador" },
            ]}
          />

          <RadioToggleField
            legend="Contenido para niños"
            name="madeForKids"
            selectedValue={filters.madeForKids === null ? null : filters.madeForKids ? "yes" : "no"}
            options={[
              { value: "yes", label: "Sí" },
              { value: "no", label: "No" },
            ]}
          />

          <RadioToggleField
            legend="Contenido sintético o con IA"
            name="syntheticMedia"
            selectedValue={filters.syntheticMedia === null ? null : filters.syntheticMedia ? "yes" : "no"}
            options={[
              { value: "yes", label: "Sí" },
              { value: "no", label: "No" },
            ]}
          />
        </div>

        {/* Preserve the active sort (set via presets) when the filter form is submitted. */}
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Aplicar filtros
          </button>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            Limpiar filtros
          </Link>
        </div>
      </Form>
    </section>
  );
}

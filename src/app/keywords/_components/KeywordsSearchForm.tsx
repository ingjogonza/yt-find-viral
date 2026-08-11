import Form from "next/form";
import Link from "next/link";
import { buildKeywordsHref, type TagFrequency } from "@/lib/keywords";

type KeywordsSearchFormProps = {
  query: string | null;
  topTags: TagFrequency[];
};

/**
 * Free-text tag search box + the "most frequent tags" chip cloud. Same
 * URL-as-state convention as the rest of the app (native GET form via
 * next/form, chips are plain links to `/keywords?q=<tag>`) — clicking a chip
 * applies that word exactly as if it had been typed into the search box.
 */
export function KeywordsSearchForm({ query, topTags }: KeywordsSearchFormProps) {
  return (
    <section className="mb-8 space-y-4">
      <div className="rounded-lg border border-gray-200 p-4">
        <Form action="/keywords" className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="q" className="block text-sm font-medium text-gray-700">
              Buscar por tag
            </label>
            <input
              type="search"
              id="q"
              name="q"
              defaultValue={query ?? ""}
              placeholder="Ej: cooking, gaming, tutorial..."
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Buscar
          </button>
          {query && (
            <Link href="/keywords" className="text-sm text-gray-500 hover:text-gray-700">
              Limpiar búsqueda
            </Link>
          )}
        </Form>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700">Tags más frecuentes en tu catálogo</h2>
        {topTags.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            Todavía no hay tags guardados. Corré scripts/discover.ts para poblarlos.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {topTags.map((tagFrequency) => (
              <li key={tagFrequency.tag}>
                <Link
                  href={buildKeywordsHref(tagFrequency.tag)}
                  className={`rounded-full border px-3 py-1 text-sm hover:bg-gray-50 ${
                    query?.toLowerCase() === tagFrequency.tag.toLowerCase()
                      ? "border-gray-900 bg-gray-900 text-white hover:bg-gray-700"
                      : "border-gray-300 text-gray-700"
                  }`}
                >
                  {tagFrequency.tag}{" "}
                  <span className={query?.toLowerCase() === tagFrequency.tag.toLowerCase() ? "text-gray-300" : "text-gray-400"}>
                    ({tagFrequency.count})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

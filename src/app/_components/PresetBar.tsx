import Link from "next/link";
import { CATALOG_PRESETS, DEFAULT_FILTERS, buildCatalogHref } from "@/lib/catalog";

/**
 * One-click preset buttons. Each preset fully replaces the URL
 * searchParams with its own fixed filter/sort combo (built from
 * DEFAULT_FILTERS, ignoring whatever is currently active) — per spec,
 * presets "just set/replace the URL searchParams" rather than merge with
 * the current filter state.
 */
export function PresetBar() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {CATALOG_PRESETS.map((preset) => (
        <Link
          key={preset.key}
          href={buildCatalogHref(DEFAULT_FILTERS, preset.overrides)}
          className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          {preset.label}
        </Link>
      ))}
    </div>
  );
}

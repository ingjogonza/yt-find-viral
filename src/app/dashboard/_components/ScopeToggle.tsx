"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import type { DashboardScope } from "@/lib/dashboard";

const OPTIONS: { value: DashboardScope; label: string }[] = [
  { value: "all", label: "Todo el catálogo" },
  { value: "favorites", label: "Solo favoritos" },
];

type ScopeToggleProps = {
  scope: DashboardScope;
  children: ReactNode;
};

/**
 * The single scope filter ("Todo el catálogo" / "Solo favoritos") that
 * applies to the 4 charts + suggested-niches panel at once — never a
 * per-chart filter. The URL (?scope=) stays the source of truth, same
 * convention as every other filter in this app (shareable/bookmarkable).
 *
 * `router.push` wrapped in `startTransition` keeps the PREVIOUS
 * server-rendered `children` on screen (dimmed via `isPending`) while the
 * new scope's data loads server-side, instead of a blank flash — React
 * only swaps `children` once the new RSC payload for the new URL arrives.
 */
export function ScopeToggle({ scope, children }: ScopeToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setScope(next: DashboardScope) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("scope");
    else params.set("scope", next);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
    });
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Alcance de los datos"
        className="mb-6 inline-flex rounded-md border border-gray-300 p-1"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={scope === option.value}
            onClick={() => setScope(option.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              scope === option.value ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        className="transition-opacity duration-200"
        style={{ opacity: isPending ? 0.5 : 1 }}
        aria-busy={isPending}
      >
        {children}
      </div>
    </div>
  );
}

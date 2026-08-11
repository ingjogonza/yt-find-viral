"use client";

import { useRouter } from "next/navigation";

/**
 * "Sorpréndeme" button — the only client JS on `/viral`. Picks a fresh
 * random seed and navigates to `/viral?seed=<newSeed>`; the page itself
 * stays a Server Component and does the actual (seeded, deterministic)
 * shuffle server-side from that seed.
 */
export function SurpriseButton() {
  const router = useRouter();

  function handleClick() {
    const seed = Math.floor(Math.random() * 2 ** 31);
    router.push(`/viral?seed=${seed}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
    >
      Sorpréndeme
    </button>
  );
}

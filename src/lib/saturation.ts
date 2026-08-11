import { PrismaClient } from "@prisma/client";

/**
 * Data layer for the `/saturacion` page ("Riesgo de saturación").
 *
 * This is an intentionally approximate, catalog-only signal — there is no
 * social media monitoring here (out of scope for a personal project), so
 * "saturation" just means "this category is growing faster in MY catalog
 * than others". See SATURATION_DISCLAIMER_ES, always rendered on the page.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Window used to compute the "growing fast" signal: channels in a category
 * discovered within the last N days. */
const SATURATION_WINDOW_DAYS = 90;

export const SATURATION_DISCLAIMER_ES =
  "Esta señal se basa solo en tu catálogo, no en redes sociales — una categoría con pocos canales " +
  "descubiertos no necesariamente es segura, puede que tu catálogo simplemente no la haya cubierto todavía.";

export type CategorySaturation = {
  categoryId: string;
  saturationSignal: number;
  totalChannels: number;
};

/**
 * For each distinct dominantCategoryId present in the catalog (nulls/
 * unclassified channels are skipped entirely), computes saturationSignal =
 * count of channels in that category discovered in the last
 * SATURATION_WINDOW_DAYS. Sorted by saturationSignal descending.
 */
export async function loadCategorySaturation(prisma: PrismaClient): Promise<CategorySaturation[]> {
  const channels = await prisma.channel.findMany({
    where: { dominantCategoryId: { not: null } },
    select: { dominantCategoryId: true, firstDiscoveredAt: true },
  });

  const cutoff = new Date(Date.now() - SATURATION_WINDOW_DAYS * MS_PER_DAY);

  const byCategory = new Map<string, { saturationSignal: number; totalChannels: number }>();
  for (const channel of channels) {
    const categoryId = channel.dominantCategoryId;
    if (!categoryId) continue; // narrows for TS; already excluded by the WHERE above

    const entry = byCategory.get(categoryId) ?? { saturationSignal: 0, totalChannels: 0 };
    entry.totalChannels += 1;
    if (channel.firstDiscoveredAt >= cutoff) entry.saturationSignal += 1;
    byCategory.set(categoryId, entry);
  }

  return [...byCategory.entries()]
    .map(([categoryId, { saturationSignal, totalChannels }]) => ({ categoryId, saturationSignal, totalChannels }))
    .sort((a, b) => b.saturationSignal - a.saturationSignal);
}

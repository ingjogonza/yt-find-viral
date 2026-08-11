"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import type { CategoryBar } from "@/lib/dashboard";
import { categoryLabel } from "@/lib/rpm";
import { ChartContainer } from "./ChartContainer";

function formatScore(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

type CategoryBarWithLabel = CategoryBar & { label: string };

function CategoryBarTable({ bars }: { bars: CategoryBarWithLabel[] }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead>
        <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
          <th className="px-3 py-2">Categoría</th>
          <th className="px-3 py-2 text-right">Niche score</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {bars.map((bar) => (
          <tr key={bar.categoryId}>
            <td className="px-3 py-2">{bar.label}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatScore(bar.nicheScore)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Top-8-by-niche_score categories, horizontal bars. Nominal categories with
 * no natural order -> a SINGLE color for every bar, never a value gradient. */
export function CategoryBarChartCard({ bars }: { bars: CategoryBar[] }) {
  const data: CategoryBarWithLabel[] = bars.map((b) => ({ ...b, label: categoryLabel(b.categoryId) }));

  return (
    <ChartContainer
      title="Top categorías por niche score"
      description="niche_score = avg_outlier_score × cantidad de canales outlier en la categoría."
      tableFallback={<CategoryBarTable bars={data} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 8 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--gridline)" strokeWidth={1} horizontal={false} />
          <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 12 }} stroke="var(--baseline)" />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
            stroke="var(--baseline)"
          />
          <Bar dataKey="nicheScore" fill="var(--series-default)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
            <LabelList
              dataKey="nicheScore"
              position="right"
              formatter={(value) => (typeof value === "number" ? formatScore(value) : "")}
              fill="var(--text-secondary)"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { HistogramBin } from "@/lib/dashboard";
import { ChartContainer } from "./ChartContainer";

function HistogramTable({ bins }: { bins: HistogramBin[] }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead>
        <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
          <th className="px-3 py-2">Rango de outlier score</th>
          <th className="px-3 py-2 text-right">Canales</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {bins.map((bin) => (
          <tr key={bin.label}>
            <td className="px-3 py-2">{bin.label}</td>
            <td className="px-3 py-2 text-right tabular-nums">{bin.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OutlierHistogramCard({ bins }: { bins: HistogramBin[] }) {
  return (
    <ChartContainer
      title="Distribución de outlier score"
      description="Cantidad de canales por rango de outlier score, dentro del alcance seleccionado."
      tableFallback={<HistogramTable bins={bins} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} barCategoryGap={2} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--gridline)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} stroke="var(--baseline)" />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} stroke="var(--baseline)" />
          <Bar dataKey="count" fill="var(--series-default)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

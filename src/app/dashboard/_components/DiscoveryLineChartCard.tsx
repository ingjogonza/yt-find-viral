"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { DiscoveryPoint } from "@/lib/dashboard";
import { ChartContainer } from "./ChartContainer";

function formatDateEs(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function DiscoveryTable({ points }: { points: DiscoveryPoint[] }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead>
        <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
          <th className="px-3 py-2">Día</th>
          <th className="px-3 py-2 text-right">Canales nuevos</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {points.map((p) => (
          <tr key={p.date}>
            <td className="px-3 py-2">{formatDateEs(p.date)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{p.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DiscoveryLineChartCard({ points }: { points: DiscoveryPoint[] }) {
  const lastIndex = points.length - 1;

  function renderDot(props: { cx?: number; cy?: number; index?: number }) {
    const { cx, cy, index } = props;
    if (index !== lastIndex || cx == null || cy == null) return <g key={`dot-${index}`} />;
    return (
      <g key={`dot-${index}`}>
        <circle cx={cx} cy={cy} r={4} fill="var(--series-default)" stroke="var(--surface-1)" strokeWidth={2} />
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize={12} fill="var(--text-primary)">
          {points[lastIndex]?.count}
        </text>
      </g>
    );
  }

  return (
    <ChartContainer
      title="Canales nuevos descubiertos por día"
      description="Últimos 30 días, agrupado por fecha de primer descubrimiento."
      tableFallback={<DiscoveryTable points={points} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 20, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--gridline)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateEs}
            tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
            stroke="var(--baseline)"
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} stroke="var(--baseline)" />
          <Tooltip
            labelFormatter={(label) => (typeof label === "string" ? formatDateEs(label) : String(label ?? ""))}
            formatter={(value) => [String(value), "Canales nuevos"]}
            contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--gridline)" }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--series-default)"
            strokeWidth={2}
            dot={renderDot}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

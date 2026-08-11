"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ScatterPoint } from "@/lib/dashboard";
import { ChartContainer } from "./ChartContainer";

function formatNumber(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function formatOutlierScore(value: number | null): string {
  return value != null ? `${value.toFixed(2)}x` : "muestra insuficiente";
}

type TooltipPayloadEntry = { payload: ScatterPoint };

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div
      className="rounded-md px-3 py-2 text-xs shadow-sm"
      style={{ background: "var(--surface-1)", border: "1px solid var(--gridline)" }}
    >
      <p className="font-medium" style={{ color: "var(--text-primary)" }}>
        {point.title}
      </p>
      <p style={{ color: "var(--text-secondary)" }}>Canal: {point.title}</p>
      <p style={{ color: "var(--text-secondary)" }}>Suscriptores: {formatNumber(point.subscriberCount)}</p>
      <p style={{ color: "var(--text-secondary)" }}>Vistas prom.: {formatNumber(point.avgViewsRecent)}</p>
      <p style={{ color: "var(--text-secondary)" }}>Outlier score: {formatOutlierScore(point.outlierScore)}</p>
    </div>
  );
}

/** Renders each scatter point ≥8px in diameter with a 2px ring in the
 * surface color — "no borders around marks" elsewhere in the dashboard
 * refers to bars/columns; this ring is the one explicitly requested for
 * scatter points, to visually separate overlapping dots. */
function ScatterDot(props: { cx?: number; cy?: number; fill?: string }) {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill={fill} stroke="var(--surface-1)" strokeWidth={2} />;
}

function ScatterTable({ points }: { points: ScatterPoint[] }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead>
        <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
          <th className="px-3 py-2">Canal</th>
          <th className="px-3 py-2 text-right">Suscriptores</th>
          <th className="px-3 py-2 text-right">Vistas prom.</th>
          <th className="px-3 py-2 text-right">Outlier score</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {points.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2">{p.title}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatNumber(p.subscriberCount)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatNumber(p.avgViewsRecent)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatOutlierScore(p.outlierScore)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScatterChartCard({ points }: { points: ScatterPoint[] }) {
  const normal = points.filter((p) => !p.isOutlier);
  const outliers = points.filter((p) => p.isOutlier);

  return (
    <ChartContainer
      title="Vistas promedio vs. suscriptores"
      description="Cada punto es un canal. Naranja = outlier (outlier score ≥ 3)."
      tableFallback={<ScatterTable points={points} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--gridline)" strokeWidth={1} />
          <XAxis
            type="number"
            dataKey="subscriberCount"
            name="Suscriptores"
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
            stroke="var(--baseline)"
          />
          <YAxis
            type="number"
            dataKey="avgViewsRecent"
            name="Vistas prom."
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
            stroke="var(--baseline)"
          />
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--baseline)" }} />
          {/* Legend auto-derives its 2 items ("Outlier" / "Normal") from these
              two Scatter series' name+fill — declared in this order so that's
              also the legend's display order. */}
          <Legend />
          <Scatter
            name="Outlier"
            data={outliers}
            fill="var(--series-accent)"
            shape={ScatterDot}
            isAnimationActive={false}
          />
          <Scatter name="Normal" data={normal} fill="var(--text-muted)" shape={ScatterDot} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

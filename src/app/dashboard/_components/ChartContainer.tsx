import type { ReactNode } from "react";

type ChartContainerProps = {
  title: string;
  description?: string;
  /** Fixed height (px) for the chart area, INCLUDING the x-axis — reserving
   * this upfront avoids layout shift and any blank-then-pop-in flash while
   * Recharts' ResponsiveContainer measures itself on mount. */
  height?: number;
  children: ReactNode;
  tableFallback: ReactNode;
};

/** Shared shell for the 4 dashboard charts: title, fixed-height chart area,
 * and a "Ver como tabla" toggle (native <details>, no client JS) right below. */
export function ChartContainer({ title, description, height = 320, children, tableFallback }: ChartContainerProps) {
  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      <div style={{ height }} className="mt-3 w-full">
        {children}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto text-sm">{tableFallback}</div>
      </details>
    </section>
  );
}

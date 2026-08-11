import { prisma } from "@/lib/prisma";
import { loadDashboardData, isDashboardScope, type DashboardScope } from "@/lib/dashboard";
import { ScopeToggle } from "./_components/ScopeToggle";
import { SuggestedNiches } from "./_components/SuggestedNiches";
import { ScatterChartCard } from "./_components/ScatterChartCard";
import { CategoryBarChartCard } from "./_components/CategoryBarChartCard";
import { OutlierHistogramCard } from "./_components/OutlierHistogramCard";
import { DiscoveryLineChartCard } from "./_components/DiscoveryLineChartCard";

type DashboardSearchParams = { scope?: string | string[] };

// Reading searchParams (?scope=) opts this page into per-request dynamic
// rendering, same convention as every filtered page in this app.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const resolved = await searchParams;
  const raw = typeof resolved.scope === "string" ? resolved.scope : undefined;
  const scope: DashboardScope = isDashboardScope(raw) ? raw : "all";

  const data = await loadDashboardData(prisma, scope);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          {data.totalChannelsInScope.toLocaleString("es-ES")} canales en este alcance.
        </p>
      </header>

      <ScopeToggle scope={scope}>
        <SuggestedNiches niches={data.suggestedNiches} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ScatterChartCard points={data.scatterPoints} />
          <CategoryBarChartCard bars={data.topCategoryBars} />
          <OutlierHistogramCard bins={data.histogram} />
          <DiscoveryLineChartCard points={data.discoveryTimeline} />
        </div>
      </ScopeToggle>
    </main>
  );
}

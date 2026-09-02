import { PageHeader } from "@/components/patterns/page-header";
import { ComingSoon } from "@/components/patterns/coming-soon";

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Analytics" description="The ten founders' weekly numbers, defined and automated." />
      <ComingSoon
        icon="chart"
        title="Founder weekly dashboard"
        body="Every metric is precisely defined in docs/07-analytics-and-metrics.md — grain, formula and edge cases — ready to build against once the nightly rollup tables land."
        phase="Phase 6 — Analytics & reporting"
      />
    </div>
  );
}

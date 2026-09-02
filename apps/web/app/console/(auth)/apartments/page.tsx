import { PageHeader } from "@/components/patterns/page-header";
import { ComingSoon } from "@/components/patterns/coming-soon";

export default function ApartmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Apartments" description="Clusters, contacts and serviceability." />
      <ComingSoon
        icon="apartment"
        title="Apartment management UI"
        body="The API for hubs, clusters, apartments and watchman contacts is live (docs/04 §3.2). The management screens for editing them land alongside the production board in Phase 2."
        phase="Phase 2 — Ops console"
      />
    </div>
  );
}

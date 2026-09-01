import { PageHeader } from "@/components/patterns/page-header";
import { ComingSoon } from "@/components/patterns/coming-soon";

export default function PricingPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pricing" description="Effective-dated price lists and offers." />
      <ComingSoon
        icon="percent"
        title="Price list management"
        body="Effective-dated price lists are already how every quote is computed (ADR-005) — the API to create and activate new versions is live. The founder-facing screen for managing them without the Django admin ships in Phase 3."
        phase="Phase 3 — Money"
      />
    </div>
  );
}

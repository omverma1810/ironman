import { PageHeader } from "@/components/patterns/page-header";
import { ComingSoon } from "@/components/patterns/coming-soon";

export default function ExceptionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exceptions" description="Damaged, lost, missing and disputed items." />
      <ComingSoon
        icon="alert-triangle"
        title="Exceptions queue"
        body="The order-exceptions API (docs/00 §4 G-6) is live and orders can already carry exceptions. The triage queue with SLAs and assignment ships with the custody/production board in Phase 2."
        phase="Phase 2 — Ops console"
      />
    </div>
  );
}

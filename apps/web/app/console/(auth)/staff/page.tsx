import { PageHeader } from "@/components/patterns/page-header";
import { ComingSoon } from "@/components/patterns/coming-soon";

export default function StaffPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Staff" description="Roles, invites and hub assignment." />
      <ComingSoon
        icon="shield"
        title="Staff management"
        body="Invite-only staff registration, roles and hub scoping are all live server-side (docs/06 §2.2) — seeded staff can log in today. The console screen for inviting and managing staff without the Django admin is next up."
        phase="Phase 2 — Ops console"
      />
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/api/types";

/** docs/02 §3.7 job lifecycle, one badge for the route-day board — mirrors
 * StageBadge/GarmentStageBadge's role for the order and garment lifecycles
 * (docs/05 §2.2: colour is always paired with text, never colour alone). */
const JOB_STATUS_META: Record<JobStatus, { label: string; variant: BadgeProps["variant"] }> = {
  PENDING: { label: "Pending", variant: "neutral" },
  EN_ROUTE: { label: "En route", variant: "info" },
  ARRIVED: { label: "Arrived", variant: "info" },
  DONE: { label: "Done", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
};

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const meta = JOB_STATUS_META[status];
  return (
    <Badge variant={meta.variant} dot className={className}>
      {meta.label}
    </Badge>
  );
}

export { JOB_STATUS_META };

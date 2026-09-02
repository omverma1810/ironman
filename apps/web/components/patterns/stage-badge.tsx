import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/api/types";

/** One badge component for order stage, used identically on the orders
 * table, the order timeline and (later) the production board and job
 * card — docs/05 §2.2: "a rider and a founder read the same colour for
 * Pressing." Colour is always paired with text, never colour alone. */
const STAGE_META: Record<OrderStatus, { label: string; dot: string; text: string; bg: string }> = {
  DRAFT: { label: "Draft", dot: "bg-status-neutral", text: "text-status-neutral", bg: "bg-status-neutral-bg" },
  PENDING_CONFIRMATION: { label: "Pending confirmation", dot: "bg-stage-booked", text: "text-status-neutral", bg: "bg-status-neutral-bg" },
  SCHEDULED: { label: "Scheduled", dot: "bg-stage-booked", text: "text-status-info", bg: "bg-status-info-bg" },
  PICKUP_ASSIGNED: { label: "Pickup assigned", dot: "bg-stage-pickup", text: "text-status-info", bg: "bg-status-info-bg" },
  PICKUP_EN_ROUTE: { label: "Pickup en route", dot: "bg-stage-pickup", text: "text-status-info", bg: "bg-status-info-bg" },
  PICKUP_FAILED: { label: "Pickup failed", dot: "bg-stage-failed", text: "text-status-danger", bg: "bg-status-danger-bg" },
  PICKED_UP: { label: "Picked up", dot: "bg-stage-pickup", text: "text-status-info", bg: "bg-status-info-bg" },
  AT_HUB: { label: "At hub", dot: "bg-stage-at-hub", text: "text-status-info", bg: "bg-status-info-bg" },
  INTAKE_VERIFIED: { label: "Intake verified", dot: "bg-stage-at-hub", text: "text-status-info", bg: "bg-status-info-bg" },
  IN_PRODUCTION: { label: "Pressing", dot: "bg-stage-pressing", text: "text-status-warning", bg: "bg-status-warning-bg" },
  READY: { label: "Ready", dot: "bg-stage-ready", text: "text-status-success", bg: "bg-status-success-bg" },
  DELIVERY_ASSIGNED: { label: "Delivery assigned", dot: "bg-stage-out", text: "text-status-info", bg: "bg-status-info-bg" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", dot: "bg-stage-out", text: "text-status-info", bg: "bg-status-info-bg" },
  DELIVERY_FAILED: { label: "Delivery failed", dot: "bg-stage-failed", text: "text-status-danger", bg: "bg-status-danger-bg" },
  RETURNED_TO_HUB: { label: "Returned to hub", dot: "bg-stage-hold", text: "text-status-warning", bg: "bg-status-warning-bg" },
  DELIVERED: { label: "Delivered", dot: "bg-stage-delivered", text: "text-status-success", bg: "bg-status-success-bg" },
  ON_HOLD: { label: "On hold", dot: "bg-stage-hold", text: "text-status-danger", bg: "bg-status-danger-bg" },
  CANCELLED: { label: "Cancelled", dot: "bg-status-neutral", text: "text-status-neutral", bg: "bg-status-neutral-bg" },
  CLOSED: { label: "Closed", dot: "bg-status-neutral", text: "text-status-neutral", bg: "bg-status-neutral-bg" },
};

export function StageBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = STAGE_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium",
        meta.bg,
        meta.text,
        className
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export { STAGE_META };

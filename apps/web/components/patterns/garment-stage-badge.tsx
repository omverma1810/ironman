import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import type { GarmentStage } from "@/lib/api/types";

/** docs/01 §5.3 stages, one badge everywhere a garment's stage is shown —
 * mirrors StageBadge's order-level counterpart (docs/05 §2.2: colour is
 * always paired with text, never colour alone). */
const GARMENT_STAGE_META: Record<GarmentStage, { label: string; variant: BadgeProps["variant"] }> = {
  RECEIVED: { label: "Received", variant: "neutral" },
  SORTED: { label: "Sorted", variant: "info" },
  PRESSING: { label: "Pressing", variant: "warning" },
  PRESSED: { label: "Pressed", variant: "warning" },
  QC: { label: "Quality check", variant: "warning" },
  REWORK: { label: "Rework", variant: "danger" },
  PACKED: { label: "Packed", variant: "success" },
  DISPATCHED: { label: "Dispatched", variant: "info" },
  DELIVERED: { label: "Delivered", variant: "success" },
  DAMAGED: { label: "Damaged", variant: "danger" },
  LOST: { label: "Lost", variant: "danger" },
  HELD: { label: "Held", variant: "danger" },
  RETURNED_UNPRESSED: { label: "Returned unpressed", variant: "warning" },
};

export function GarmentStageBadge({
  stage,
  className,
}: {
  stage: GarmentStage;
  className?: string;
}) {
  const meta = GARMENT_STAGE_META[stage];
  return (
    <Badge variant={meta.variant} dot className={className}>
      {meta.label}
    </Badge>
  );
}

export { GARMENT_STAGE_META };

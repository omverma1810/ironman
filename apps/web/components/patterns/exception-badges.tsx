import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import type { OrderException } from "@/lib/api/types";

const KIND_LABEL: Record<OrderException["kind"], string> = {
  DAMAGED: "Damaged",
  LOST: "Lost",
  MISSING: "Missing",
  WRONG_ITEM: "Wrong item",
  REPRESS: "Re-press requested",
  COMPLAINT: "Complaint",
};

const SEVERITY_META: Record<OrderException["severity"], { label: string; variant: BadgeProps["variant"] }> = {
  LOW: { label: "Low", variant: "neutral" },
  MEDIUM: { label: "Medium", variant: "warning" },
  HIGH: { label: "High", variant: "danger" },
};

const STATUS_META: Record<OrderException["status"], { label: string; variant: BadgeProps["variant"] }> = {
  OPEN: { label: "Open", variant: "danger" },
  INVESTIGATING: { label: "Investigating", variant: "warning" },
  RESOLVED: { label: "Resolved", variant: "success" },
  WRITTEN_OFF: { label: "Written off", variant: "neutral" },
};

export function exceptionKindLabel(kind: OrderException["kind"]): string {
  return KIND_LABEL[kind];
}

export function ExceptionSeverityBadge({ severity }: { severity: OrderException["severity"] }) {
  const meta = SEVERITY_META[severity];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function ExceptionStatusBadge({ status }: { status: OrderException["status"] }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.variant} dot>
      {meta.label}
    </Badge>
  );
}

const OPEN_STATUSES: OrderException["status"][] = ["OPEN", "INVESTIGATING"];

/** A queue item's SLA state — only meaningful while it's still open. */
export function SlaBadge({ slaDueAt, status }: { slaDueAt: string | null; status: OrderException["status"] }) {
  if (!slaDueAt || !OPEN_STATUSES.includes(status)) return <span className="text-text-muted">—</span>;
  const due = new Date(slaDueAt);
  const overdue = due.getTime() < Date.now();
  if (overdue) {
    return <Badge variant="danger">Overdue</Badge>;
  }
  const dueToday = due.toDateString() === new Date().toDateString();
  return <Badge variant={dueToday ? "warning" : "outline"}>{dueToday ? "Due today" : "On track"}</Badge>;
}

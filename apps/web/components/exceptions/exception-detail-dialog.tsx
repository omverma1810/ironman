"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ExceptionSeverityBadge,
  exceptionKindLabel,
} from "@/components/patterns/exception-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe, useOpsStaff, useUpdateException } from "@/lib/api/hooks";
import { canManageStaff } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { OrderException } from "@/lib/api/types";

const STATUS_OPTIONS: OrderException["status"][] = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
  "WRITTEN_OFF",
];
const CLOSED_STATUSES: OrderException["status"][] = ["RESOLVED", "WRITTEN_OFF"];

export function ExceptionDetailDialog({
  exception,
  open,
  onOpenChange,
}: {
  exception: OrderException;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useMe();
  const canAssignAnyone = canManageStaff(me.data?.roles);
  const opsStaff = useOpsStaff(canAssignAnyone);

  const [status, setStatus] = useState<OrderException["status"]>(exception.status);
  const [assignedTo, setAssignedTo] = useState(exception.assigned_to ?? "");
  const [resolution, setResolution] = useState(exception.resolution);
  const [costRupees, setCostRupees] = useState(String(exception.cost_minor / 100));
  const update = useUpdateException();

  useEffect(() => {
    if (open) {
      setStatus(exception.status);
      setAssignedTo(exception.assigned_to ?? "");
      setResolution(exception.resolution);
      setCostRupees(String(exception.cost_minor / 100));
    }
  }, [open, exception]);

  const closing = CLOSED_STATUSES.includes(status) && !CLOSED_STATUSES.includes(exception.status);

  function handleSave() {
    const patch: Partial<OrderException> = { status, resolution, assigned_to: assignedTo || null };
    const cost = Math.round(Number(costRupees || 0) * 100);
    if (Number.isFinite(cost)) patch.cost_minor = cost;
    if (closing) patch.resolved_at = new Date().toISOString();
    update.mutate({ id: exception.id, patch }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {exceptionKindLabel(exception.kind)}
            <ExceptionSeverityBadge severity={exception.severity} />
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <Link href={`/console/orders/${exception.order}`} className="font-medium hover:underline">
              {exception.order_ref}
            </Link>
            <span>·</span>
            <span>Raised by {exception.raised_by_name || "—"}</span>
            <span>·</span>
            <span>{formatDateTime(exception.created_at)}</span>
          </div>

          <p className="rounded-md bg-surface-sunken p-3 text-sm text-text-primary">
            {exception.description}
          </p>

          {exception.sla_due_at && (
            <p className="text-sm text-text-secondary">
              SLA due {formatDateTime(exception.sla_due_at)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as OrderException["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replaceAll("_", " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Assigned to</Label>
              {canAssignAnyone ? (
                <Select
                  value={assignedTo || "unassigned"}
                  onValueChange={(v) => setAssignedTo(v === "unassigned" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {opsStaff.data?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="flex-1 justify-center py-1.5">
                    {exception.assigned_to_name || "Unassigned"}
                  </Badge>
                  {me.data && exception.assigned_to !== me.data.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setAssignedTo(me.data!.id)}
                    >
                      Assign to me
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exc-resolution">
              Resolution {closing && <span className="text-status-danger">*</span>}
            </Label>
            <textarea
              id="exc-resolution"
              className="min-h-20 w-full rounded-md border border-border-default bg-surface-base p-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus"
              placeholder="What happened, and how it was made right…"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exc-cost">Cost to the business (₹)</Label>
            <Input
              id="exc-cost"
              type="number"
              min={0}
              step="0.01"
              className="w-32"
              value={costRupees}
              onChange={(e) => setCostRupees(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            disabled={closing && !resolution.trim()}
            onClick={handleSave}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrderIntake } from "@/lib/api/hooks";
import type { OrderDetail } from "@/lib/api/types";

/** docs/02 §3.5 / ADR-008: the hub's own count, not the pickup rider's or
 * the customer's online estimate — this is what drives billing. Variance
 * beyond the configured threshold pauses the order in a re-quote rather
 * than silently rebilling (handled server-side; the pending-requote
 * banner on the order page picks it up once this submits). */
export function IntakeDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const intake = useOrderIntake();

  useEffect(() => {
    if (open) {
      setQty(Object.fromEntries(order.lines.map((line) => [line.garment_type, line.declared_qty])));
      setNotes("");
    }
  }, [open, order.lines]);

  const total = Object.values(qty).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

  function handleSubmit() {
    intake.mutate(
      {
        id: order.id,
        verified_lines: order.lines.map((line) => ({
          garment_type: line.garment_type,
          qty: qty[line.garment_type] ?? 0,
        })),
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify intake — {order.ref}</DialogTitle>
          <DialogDescription>
            Count what actually arrived. A count that differs enough from the estimate pauses the
            order for a re-quote instead of silently rebilling the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {order.lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3">
              <Label htmlFor={`qty-${line.id}`} className="flex-1 font-normal">
                {line.garment_type_name}
                <span className="ml-2 text-xs text-text-muted">est. {line.declared_qty}</span>
              </Label>
              <Input
                id={`qty-${line.id}`}
                type="number"
                min={0}
                className="w-20"
                value={qty[line.garment_type] ?? 0}
                onChange={(e) =>
                  setQty((prev) => ({
                    ...prev,
                    [line.garment_type]: Math.max(0, Number(e.target.value)),
                  }))
                }
              />
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border-default pt-3 text-sm">
            <span className="text-text-secondary">Total counted</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary tabular-nums">{total}</span>
              {total !== order.declared_total_qty && (
                <Badge variant="warning">est. {order.declared_total_qty}</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="intake-notes">Notes (optional)</Label>
            <textarea
              id="intake-notes"
              className="min-h-16 w-full rounded-md border border-border-default bg-surface-base p-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-border-focus"
              placeholder="Anything ops should know — a stain, a missing item…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={intake.isPending} onClick={handleSubmit}>
            Confirm intake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

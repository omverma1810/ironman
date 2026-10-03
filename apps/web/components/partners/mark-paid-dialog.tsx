"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarkSettlementPaid } from "@/lib/api/hooks";
import { formatMoneyMinor } from "@/lib/format";
import type { PayoutMethod, Settlement } from "@/lib/api/types";

const METHOD_LABEL: Record<PayoutMethod, string> = {
  UPI: "UPI",
  CASH: "Cash",
  BANK: "Bank transfer",
};

export function MarkPaidDialog({
  settlement,
  onOpenChange,
}: {
  settlement: Settlement | null;
  onOpenChange: (open: boolean) => void;
}) {
  const markPaid = useMarkSettlementPaid();
  const [method, setMethod] = useState<PayoutMethod>("UPI");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (settlement) {
      setMethod("UPI");
      setReference("");
    }
  }, [settlement]);

  const needsRef = method !== "CASH";
  const valid = !needsRef || reference.trim().length > 0;

  return (
    <Dialog open={!!settlement} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {settlement?.ref} paid</DialogTitle>
          <DialogDescription>
            {settlement
              ? `${formatMoneyMinor(settlement.total_minor)} to ${settlement.partner_name}${
                  settlement.partner_upi_id ? ` (UPI ${settlement.partner_upi_id})` : ""
                }.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Paid by</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayoutMethod)}>
              <SelectTrigger aria-label="Paid by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METHOD_LABEL).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payout-ref">
              {needsRef ? "Transaction reference" : "Reference (optional)"}
            </Label>
            <Input
              id="payout-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={needsRef ? "UPI / UTR number" : ""}
            />
          </div>
        </div>
        {method === "CASH" && (
          <p className="text-sm text-text-muted">
            For cash, print the statement and have the partner sign it.
          </p>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            loading={markPaid.isPending}
            onClick={() =>
              settlement &&
              markPaid.mutate(
                { id: settlement.id, method, reference: reference.trim() },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

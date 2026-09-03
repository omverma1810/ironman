"use client";

import { useEffect, useState } from "react";
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
import { useAdjustStock } from "@/lib/api/hooks";
import type { AdjustmentKind, StockItem } from "@/lib/api/types";

const KIND_LABEL: Record<AdjustmentKind, string> = {
  ISSUE: "Issue (used up)",
  WASTAGE: "Wastage (damaged/spilled)",
  RETURN: "Return (came back)",
  ADJUSTMENT: "Correction (recount)",
};

// ISSUE and WASTAGE always reduce stock, RETURN always increases it — the
// server enforces the same signs (supplies/services.py `adjust_stock`), so
// the quantity field asks for a magnitude and this table supplies the sign.
const KIND_SIGN: Record<AdjustmentKind, 1 | -1 | null> = {
  ISSUE: -1,
  WASTAGE: -1,
  RETURN: 1,
  ADJUSTMENT: null,
};

export function AdjustStockDialog({
  items,
  open,
  onOpenChange,
}: {
  items: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [item, setItem] = useState("");
  const [kind, setKind] = useState<AdjustmentKind>("ISSUE");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  const adjustStock = useAdjustStock();

  useEffect(() => {
    if (open) {
      setItem(items[0]?.id ?? "");
      setKind("ISSUE");
      setQty("");
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const qtyNum = Number(qty);
  const sign = KIND_SIGN[kind];
  const valid = !!item && Number.isInteger(qtyNum) && qtyNum > 0;

  function handleSave() {
    // ADJUSTMENT has no fixed sign — a positive quantity here means "add
    // back" (a correction found more than expected); reach for ISSUE or
    // WASTAGE to record stock going out.
    const delta = sign === null ? qtyNum : sign * qtyNum;
    adjustStock.mutate(
      { item, delta, kind, note: note.trim() },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Item</Label>
            <Select value={item} onValueChange={setItem}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a stock item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.sku} — {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AdjustmentKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjust-qty">Quantity</Label>
            <Input
              id="adjust-qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="adjust-note">Note</Label>
            <Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={adjustStock.isPending} disabled={!valid} onClick={handleSave}>
            Save adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

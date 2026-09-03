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
import { useReceiveStock } from "@/lib/api/hooks";
import type { StockItem } from "@/lib/api/types";

export function ReceiveStockDialog({
  items,
  open,
  onOpenChange,
}: {
  items: StockItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");

  const receiveStock = useReceiveStock();

  useEffect(() => {
    if (open) {
      setItem(items[0]?.id ?? "");
      setQty("");
      setUnitCost("");
      setSupplier("");
      setInvoiceRef("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const qtyNum = Number(qty);
  const unitCostNum = Number(unitCost);
  const valid = !!item && Number.isInteger(qtyNum) && qtyNum > 0 && unitCostNum >= 0;

  function handleSave() {
    receiveStock.mutate(
      {
        item,
        qty: qtyNum,
        unit_cost: Math.round(unitCostNum * 100),
        supplier: supplier.trim(),
        invoice_ref: invoiceRef.trim(),
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
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
            <Label htmlFor="receipt-qty">Quantity</Label>
            <Input
              id="receipt-qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-unit-cost">Unit cost (₹)</Label>
            <Input
              id="receipt-unit-cost"
              type="number"
              min={0}
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-supplier">Supplier</Label>
            <Input
              id="receipt-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-invoice">Invoice ref</Label>
            <Input
              id="receipt-invoice"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={receiveStock.isPending} disabled={!valid} onClick={handleSave}>
            Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

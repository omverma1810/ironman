"use client";

import { useEffect, useState } from "react";
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
import { useCreateStockItem, useHubs, useUpdateStockItem } from "@/lib/api/hooks";
import type { StockCategory, StockItem, StockUnit } from "@/lib/api/types";

const CATEGORY_LABEL: Record<StockCategory, string> = {
  HANGER: "Hanger",
  COVER: "Poly cover",
  BAG: "Bag",
  CHEMICAL: "Chemical",
  SPARE: "Spare part",
  OTHER: "Other",
};

const UNIT_LABEL: Record<StockUnit, string> = {
  PIECE: "Piece",
  LITRE: "Litre",
  KG: "Kilogram",
  ROLL: "Roll",
};

export function StockItemDialog({
  item,
  open,
  onOpenChange,
}: {
  /** null = create a new stock item */
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!item;
  const hubsQuery = useHubs();
  const hubs = hubsQuery.data?.results ?? [];

  const [sku, setSku] = useState(item?.sku ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<StockCategory>(item?.category ?? "OTHER");
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? "PIECE");
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorder_level ?? 0));

  const createItem = useCreateStockItem();
  const updateItem = useUpdateStockItem();
  const saving = createItem.isPending || updateItem.isPending;

  useEffect(() => {
    if (open) {
      setSku(item?.sku ?? "");
      setName(item?.name ?? "");
      setCategory(item?.category ?? "OTHER");
      setUnit(item?.unit ?? "PIECE");
      setReorderLevel(String(item?.reorder_level ?? 0));
    }
  }, [open, item]);

  function handleSave() {
    const reorder = Number(reorderLevel);
    if (isEdit) {
      updateItem.mutate(
        {
          id: item.id,
          patch: {
            sku: sku.trim(),
            name: name.trim(),
            category,
            unit,
            reorder_level: reorder,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createItem.mutate(
        {
          hub: hubs[0]?.id ?? "",
          sku: sku.trim(),
          name: name.trim(),
          category,
          unit,
          reorder_level: reorder,
        },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  }

  const valid = sku.trim() && name.trim() && Number.isFinite(Number(reorderLevel));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? item.name : "New stock item"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock-sku">SKU</Label>
              <Input id="stock-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock-unit">Unit</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as StockUnit)}>
                <SelectTrigger id="stock-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(UNIT_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="stock-name">Name</Label>
              <Input id="stock-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as StockCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock-reorder">Reorder level</Label>
              <Input
                id="stock-reorder"
                type="number"
                min={0}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
            {isEdit && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Status</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() =>
                    updateItem.mutate({ id: item.id, patch: { is_active: !item.is_active } })
                  }
                >
                  {item.is_active ? (
                    <>
                      <Badge variant="success" dot>
                        Active
                      </Badge>{" "}
                      — click to deactivate
                    </>
                  ) : (
                    <>
                      <Badge variant="neutral" dot>
                        Inactive
                      </Badge>{" "}
                      — click to activate
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!valid} onClick={handleSave}>
            {isEdit ? "Save" : "Create item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { useRecordSpend } from "@/lib/api/hooks";
import { todayIsoIST } from "@/lib/format";
import type { Campaign, SpendCategory } from "@/lib/api/types";
import { DEFAULT_CATEGORY, SPEND_CATEGORIES } from "./labels";

export function SpendDialog({
  campaign,
  onOpenChange,
}: {
  campaign: Campaign | null;
  onOpenChange: (open: boolean) => void;
}) {
  const record = useRecordSpend();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<SpendCategory>("OTHER");
  const [spentOn, setSpentOn] = useState(todayIsoIST());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (campaign) {
      setAmount("");
      setCategory(DEFAULT_CATEGORY[campaign.channel] ?? "OTHER");
      setSpentOn(todayIsoIST());
      setNote("");
    }
  }, [campaign]);

  const minor = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(minor) && minor > 0 && spentOn <= todayIsoIST();

  return (
    <Dialog open={!!campaign} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add spend</DialogTitle>
          <DialogDescription>{campaign?.name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spend-amount">Amount (₹)</Label>
            <Input
              id="spend-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spend-date">Paid on</Label>
            <Input
              id="spend-date"
              type="date"
              max={todayIsoIST()}
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as SpendCategory)}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPEND_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spend-note">Note (optional)</Label>
            <Input
              id="spend-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="500 flyers, printed at…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            loading={record.isPending}
            onClick={() =>
              campaign &&
              record.mutate(
                {
                  campaign: campaign.id,
                  amount_minor: minor,
                  category,
                  spent_on: spentOn,
                  note: note.trim(),
                },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            Add spend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

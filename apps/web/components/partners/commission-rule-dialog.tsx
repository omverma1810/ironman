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
import { useCreateCommissionRule, useHubs } from "@/lib/api/hooks";
import { todayIsoIST } from "@/lib/format";
import type { CommissionAppliesTo, CommissionBasis } from "@/lib/api/types";
import { APPLIES_TO_LABEL, BASIS_LABEL, describeRule } from "./commission-format";

/** Rupees (or percent) typed by a person → integer paise (or basis points). */
function toMinorUnits(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function CommissionRuleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hubsQuery = useHubs();
  const hubs = hubsQuery.data?.results ?? [];
  const createRule = useCreateCommissionRule();

  const [name, setName] = useState("");
  const [basis, setBasis] = useState<CommissionBasis>("PER_ORDER");
  const [amount, setAmount] = useState("30");
  const [appliesTo, setAppliesTo] = useState<CommissionAppliesTo>("FIRST_ORDER_ONLY");
  const [firstN, setFirstN] = useState("3");
  const [cap, setCap] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIsoIST());
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setBasis("PER_ORDER");
      setAmount("30");
      setAppliesTo("FIRST_ORDER_ONLY");
      setFirstN("3");
      setCap("");
      setEffectiveFrom(todayIsoIST());
      setIsDefault(false);
    }
  }, [open]);

  const isPercent = basis === "PERCENT_OF_ORDER";
  const value = toMinorUnits(amount);
  const capMinor = cap.trim() ? toMinorUnits(cap) : null;
  const n = appliesTo === "FIRST_N_ORDERS" ? Number(firstN) : null;
  const valid =
    name.trim() &&
    value > 0 &&
    (!isPercent || value <= 10000) &&
    (capMinor === null || capMinor > 0) &&
    (n === null || (Number.isInteger(n) && n > 0)) &&
    hubs.length > 0;

  function handleSave() {
    createRule.mutate(
      {
        hub: hubs[0].id,
        name: name.trim(),
        basis,
        value,
        applies_to: basis === "FLAT_FIRST_ORDER" ? "FIRST_ORDER_ONLY" : appliesTo,
        first_n: n,
        cap_minor: capMinor,
        effective_from: effectiveFrom,
        is_default: isDefault,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New commission rule</DialogTitle>
          <DialogDescription>
            A rule&apos;s terms are fixed once it has earned anything — to change them later, end it
            and create a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Watchman — first order"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>How it&apos;s worked out</Label>
            <Select value={basis} onValueChange={(v) => setBasis(v as CommissionBasis)}>
              <SelectTrigger aria-label="How it's worked out">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BASIS_LABEL).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-amount">{isPercent ? "Percent" : "Amount (₹)"}</Label>
            <Input
              id="rule-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-cap">Cap per order (₹, optional)</Label>
            <Input
              id="rule-cap"
              inputMode="decimal"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
          </div>
          {basis !== "FLAT_FIRST_ORDER" && (
            <div
              className={
                appliesTo === "FIRST_N_ORDERS"
                  ? "flex flex-col gap-1.5"
                  : "col-span-2 flex flex-col gap-1.5"
              }
            >
              <Label>Which orders earn</Label>
              <Select
                value={appliesTo}
                onValueChange={(v) => setAppliesTo(v as CommissionAppliesTo)}
              >
                <SelectTrigger aria-label="Which orders earn">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(APPLIES_TO_LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {basis !== "FLAT_FIRST_ORDER" && appliesTo === "FIRST_N_ORDERS" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-n">How many orders</Label>
              <Input
                id="rule-n"
                inputMode="numeric"
                value={firstN}
                onChange={(e) => setFirstN(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-from">Starts on</Label>
            <Input
              id="rule-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Hub default
          </label>
        </div>

        {valid ? (
          <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
            {describeRule({
              basis,
              value,
              applies_to: appliesTo,
              first_n: n,
              cap_minor: capMinor,
            })}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={createRule.isPending} disabled={!valid} onClick={handleSave}>
            Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

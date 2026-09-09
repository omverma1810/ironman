"use client";

import { useState } from "react";
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
import { MoneyText } from "@/components/patterns/money-text";
import { useConfirmHandover, useRecordDeposit } from "@/lib/api/hooks";
import type { CashHandover } from "@/lib/api/types";

export function ConfirmHandoverDialog({
  handover,
  open,
  onOpenChange,
}: {
  handover: CashHandover | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirmHandover = useConfirmHandover();
  const [received, setReceived] = useState("");
  const [note, setNote] = useState("");

  const receivedNum = Number(received);
  const valid = received !== "" && receivedNum >= 0;
  // Not clamped to the declared amount — counting a short or over handover
  // is the whole point of this dialog (`services.confirm_handover` records
  // the variance either way).
  const varianceMinor = handover ? Math.round(receivedNum * 100) - handover.declared_amount_minor : 0;

  function handleSave() {
    if (!handover) return;
    confirmHandover.mutate(
      { id: handover.id, input: { received_amount: Math.round(receivedNum * 100), note } },
      {
        onSuccess: () => {
          setReceived("");
          setNote("");
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReceived("");
          setNote("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm handover</DialogTitle>
        </DialogHeader>
        {handover && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              {handover.from_user_name} declared{" "}
              <MoneyText minor={handover.declared_amount_minor} className="inline font-medium" />
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handover-received">Amount actually received (₹)</Label>
              <Input
                id="handover-received"
                type="number"
                min={0}
                step="0.01"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
              {received !== "" && varianceMinor !== 0 && (
                <p className={varianceMinor < 0 ? "text-xs text-status-danger" : "text-xs text-status-success"}>
                  {varianceMinor < 0 ? "Short" : "Over"} by{" "}
                  <MoneyText minor={Math.abs(varianceMinor)} className="inline" />
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handover-note">Note (optional)</Label>
              <Input
                id="handover-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for a shortfall, if any"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={confirmHandover.isPending} disabled={!valid} onClick={handleSave}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecordDepositDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const recordDeposit = useRecordDeposit();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  const amountNum = Number(amount);
  const valid = amountNum > 0;

  function handleSave() {
    recordDeposit.mutate(
      { amount: Math.round(amountNum * 100), reference: reference.trim() },
      {
        onSuccess: () => {
          setAmount("");
          setReference("");
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a bank deposit</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deposit-amount">Amount (₹)</Label>
            <Input
              id="deposit-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deposit-reference">Bank reference (optional)</Label>
            <Input
              id="deposit-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR / slip number"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={recordDeposit.isPending} disabled={!valid} onClick={handleSave}>
            Record deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

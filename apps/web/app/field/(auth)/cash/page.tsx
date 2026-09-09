"use client";

import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/empty-state";
import { MoneyText } from "@/components/patterns/money-text";
import { Icon } from "@/components/icons/icon";
import {
  useCashMine,
  useHandoverRecipients,
  useHandovers,
  useInitiateHandover,
} from "@/lib/api/hooks";
import { formatDateTime } from "@/lib/format";
import type { CashHandover } from "@/lib/api/types";

export default function FieldCashPage() {
  const [handoverOpen, setHandoverOpen] = useState(false);
  const balanceQuery = useCashMine();
  const handoversQuery = useHandovers();
  const handovers = [...(handoversQuery.data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-5 shadow-xs">
        <div className="flex items-center gap-2 text-text-secondary">
          <Icon name="wallet" className="size-4" />
          <span className="text-sm font-medium">Cash in hand</span>
        </div>
        {balanceQuery.isPending ? (
          <Skeleton className="h-9 w-32" />
        ) : balanceQuery.isError ? (
          <p className="text-sm text-status-danger">Couldn&apos;t load your balance.</p>
        ) : (
          <MoneyText
            minor={balanceQuery.data.balance_minor}
            className="font-display text-3xl font-bold text-text-primary"
          />
        )}
        <Button
          size="lg"
          disabled={!balanceQuery.data || balanceQuery.data.balance_minor <= 0}
          onClick={() => setHandoverOpen(true)}
        >
          Hand over cash
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          Handover history
        </p>
        {handoversQuery.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : handoversQuery.isError ? (
          <EmptyState
            icon="alert-triangle"
            title="Couldn't load your handovers"
            body="Check your connection and try again."
            action={
              <Button size="sm" onClick={() => handoversQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : handovers.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="No handovers yet"
            body="Cash you hand over to the hub will show up here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {handovers.map((h) => (
              <HandoverCard key={h.id} handover={h} />
            ))}
          </div>
        )}
      </div>

      <InitiateHandoverDialog
        open={handoverOpen}
        onOpenChange={setHandoverOpen}
        balanceMinor={balanceQuery.data?.balance_minor ?? 0}
      />
    </div>
  );
}

function HandoverCard({ handover }: { handover: CashHandover }) {
  const isPending = handover.status === "PENDING";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-default bg-surface-raised p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MoneyText minor={handover.declared_amount_minor} className="font-medium" />
          <span className="text-xs text-text-muted">to {handover.to_user_name}</span>
        </div>
        <Badge variant={isPending ? "warning" : "success"}>
          {isPending ? "Pending" : "Confirmed"}
        </Badge>
      </div>
      <span className="text-xs text-text-secondary">{formatDateTime(handover.created_at)}</span>
      {!isPending && handover.received_amount_minor !== null && (
        <div className="flex items-center gap-2 border-t border-border-default pt-2 text-xs">
          <span className="text-text-secondary">
            Received: <MoneyText minor={handover.received_amount_minor} className="inline" />
          </span>
          {handover.variance_minor !== 0 && (
            <span
              className={
                handover.variance_minor < 0 ? "text-status-danger" : "text-status-success"
              }
            >
              {handover.variance_minor < 0 ? "Short" : "Over"} by{" "}
              <MoneyText minor={Math.abs(handover.variance_minor)} className="inline" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function InitiateHandoverDialog({
  open,
  onOpenChange,
  balanceMinor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balanceMinor: number;
}) {
  const recipientsQuery = useHandoverRecipients();
  const initiateHandover = useInitiateHandover();
  const [toUser, setToUser] = useState("");
  const [amount, setAmount] = useState("");

  const amountNum = Number(amount);
  const balanceRupees = balanceMinor / 100;
  const valid = !!toUser && amountNum > 0 && amountNum <= balanceRupees;

  function handleSave() {
    initiateHandover.mutate(
      { to_user: toUser, amount: Math.round(amountNum * 100) },
      {
        onSuccess: () => {
          setToUser("");
          setAmount("");
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand over cash</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handover-recipient">Hand over to</Label>
            <Select value={toUser} onValueChange={setToUser}>
              <SelectTrigger id="handover-recipient">
                <SelectValue placeholder="Choose who's receiving it" />
              </SelectTrigger>
              <SelectContent>
                {(recipientsQuery.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handover-amount">Amount (₹)</Label>
            <Input
              id="handover-amount"
              type="number"
              min={0}
              max={balanceRupees}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              Cash in hand: <MoneyText minor={balanceMinor} className="inline" />
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={initiateHandover.isPending} disabled={!valid} onClick={handleSave}>
            Hand over
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

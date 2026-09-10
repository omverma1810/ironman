"use client";

import { useState } from "react";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { MoneyText } from "@/components/patterns/money-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/icons/icon";
import { useCustomerCredit, useGrantCredit } from "@/lib/api/hooks";
import { canGrantCredit, canViewCustomerCredit } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { CreditEntry, CustomerCredit, GrantCreditInput, Role } from "@/lib/api/types";

const REASON_LABEL: Record<string, string> = {
  REFERRAL: "Referral reward",
  GOODWILL: "Goodwill",
  REFUND: "Refund",
  SPEND: "Spent on order",
  EXPIRY: "Expired",
};

const GRANTABLE_REASONS: GrantCreditInput["reason"][] = ["REFERRAL", "GOODWILL", "REFUND"];

/** docs/08 batch 3.6 — Admin/Founder view of a customer's store-credit
 * ledger, same `[C own][A]` API access `CustomerCreditView` grants,
 * narrowed here to Admin/Founder since this console page has no customer
 * self-service path. Renders nothing for any other role, same "just isn't
 * part of this page for you" choice `OrderCostSection` makes. */
export function CustomerCreditSection({
  customerId,
  roles,
}: {
  customerId: string;
  roles: Role[] | undefined;
}) {
  const [grantOpen, setGrantOpen] = useState(false);
  const canView = canViewCustomerCredit(roles);
  const canGrant = canGrantCredit(roles);
  const creditQuery = useCustomerCredit(canView ? customerId : undefined);

  if (!canView) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Icon name="wallet" className="size-4 text-text-muted" />
          Store credit
        </CardTitle>
        {canGrant && (
          <Button size="sm" variant="outline" onClick={() => setGrantOpen(true)}>
            <Icon name="plus" /> Grant credit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <AsyncBoundary query={creditQuery} loading={<Skeleton className="h-24" />}>
          {(credit) => <CreditLedger credit={credit} />}
        </AsyncBoundary>
      </CardContent>
      {canGrant && (
        <GrantCreditDialog customerId={customerId} open={grantOpen} onOpenChange={setGrantOpen} />
      )}
    </Card>
  );
}

function CreditLedger({ credit }: { credit: CustomerCredit }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">Available balance</span>
        <MoneyText
          minor={credit.balance_minor}
          className="font-display text-lg font-semibold text-text-primary"
        />
      </div>
      {credit.entries.length === 0 ? (
        <p className="text-sm text-text-muted">No credit activity yet.</p>
      ) : (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            {credit.entries.map((entry) => (
              <CreditEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CreditEntryRow({ entry }: { entry: CreditEntry }) {
  const positive = entry.delta_minor > 0;
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex flex-col">
        <span className="text-text-primary">
          {REASON_LABEL[entry.reason] ?? entry.reason}
          {entry.order_ref && (
            <span className="text-text-muted"> · {entry.order_ref}</span>
          )}
        </span>
        <span className="text-xs text-text-muted">
          {formatDateTime(entry.at)}
          {entry.created_by_name && ` · ${entry.created_by_name}`}
          {entry.note && ` · ${entry.note}`}
        </span>
      </div>
      <MoneyText
        minor={entry.delta_minor}
        className={positive ? "text-status-success" : "text-text-secondary"}
      />
    </div>
  );
}

function GrantCreditDialog({
  customerId,
  open,
  onOpenChange,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<GrantCreditInput["reason"]>("GOODWILL");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const grantCredit = useGrantCredit();

  const amountNum = Number(amount);
  const valid = amountNum > 0;

  function handleSave() {
    grantCredit.mutate(
      {
        customerId,
        input: { reason, amount: Math.round(amountNum * 100), note: note.trim() || undefined },
      },
      {
        onSuccess: () => {
          setAmount("");
          setNote("");
          setReason("GOODWILL");
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant credit</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grant-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as GrantCreditInput["reason"])}>
              <SelectTrigger id="grant-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRANTABLE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASON_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grant-amount">Amount (₹)</Label>
            <Input
              id="grant-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grant-note">Note (optional)</Label>
            <Input id="grant-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={grantCredit.isPending} disabled={!valid} onClick={handleSave}>
            Grant credit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const CREDIT_REASON_LABEL = REASON_LABEL;

"use client";

import { useState } from "react";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { MoneyText } from "@/components/patterns/money-text";
import { Badge } from "@/components/ui/badge";
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
import { Icon } from "@/components/icons/icon";
import { useInvoices, useIssueCreditNote, useIssueInvoice } from "@/lib/api/hooks";
import { canIssueInvoices, canSeeMoney } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { Invoice, Role } from "@/lib/api/types";

// Same threshold as `CustodySection`'s own gating: nothing to invoice
// before intake has fixed verified quantities (docs/02 §3.5), and an
// invoice needs those figures, not the declared estimate.
const ORDER_STATUSES_WITH_INVOICING = new Set([
  "INTAKE_VERIFIED",
  "IN_PRODUCTION",
  "READY",
  "DELIVERY_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "RETURNED_TO_HUB",
  "DELIVERED",
  "CLOSED",
]);

export function InvoiceSection({
  orderId,
  orderStatus,
  roles,
}: {
  orderId: string;
  orderStatus: string;
  roles: Role[] | undefined;
}) {
  const issueInvoice = useIssueInvoice();
  const canIssue = canIssueInvoices(roles);
  const canRead = canSeeMoney(roles);
  // Only Admin/Founder can read the invoice back (docs/06 §3.1) — an
  // Operator-only session skips this query entirely rather than eating a
  // guaranteed 403 on every order detail page load.
  const invoicesQuery = useInvoices(canRead ? { order: orderId } : undefined);

  if (!ORDER_STATUSES_WITH_INVOICING.has(orderStatus)) {
    return null;
  }

  const invoice = canRead ? invoicesQuery.data?.results[0] : undefined;
  const hasInvoiceKnownToStaff = canRead && invoicesQuery.data !== undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Icon name="file-text" className="size-4 text-text-muted" />
          Invoice
        </CardTitle>
        {canIssue && (!hasInvoiceKnownToStaff || !invoice) && (
          <Button
            size="sm"
            variant="outline"
            loading={issueInvoice.isPending}
            onClick={() => issueInvoice.mutate({ orderId })}
          >
            <Icon name="plus" /> Issue invoice
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!canRead ? (
          <p className="text-sm text-text-muted">
            {canIssue
              ? "Invoice details are visible to Ops/Admin and Founder accounts."
              : "Nothing to show here for your role."}
          </p>
        ) : (
          <AsyncBoundary
            query={invoicesQuery}
            loading={<Skeleton className="h-16" />}
            isEmpty={() => !invoice}
            empty={<p className="text-sm text-text-muted">No invoice issued yet.</p>}
          >
            {() => invoice && <InvoiceSummary invoice={invoice} />}
          </AsyncBoundary>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceSummary({ invoice }: { invoice: Invoice }) {
  const [creditOpen, setCreditOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-text-primary">{invoice.ref}</span>
          <Badge variant={invoice.status === "PAID" ? "success" : "info"}>
            {invoice.status.toLowerCase()}
          </Badge>
        </div>
        <MoneyText minor={invoice.total_minor} className="font-medium" />
      </div>
      {invoice.issued_at && (
        <p className="text-xs text-text-muted">Issued {formatDateTime(invoice.issued_at)}</p>
      )}
      <Separator />
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setCreditOpen(true)}>
          Issue credit note
        </Button>
      </div>
      <CreditNoteDialog invoiceRef={invoice.ref} open={creditOpen} onOpenChange={setCreditOpen} />
    </div>
  );
}

export function CreditNoteDialog({
  invoiceRef,
  open,
  onOpenChange,
}: {
  invoiceRef: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const issueCreditNote = useIssueCreditNote();

  const amountNum = Number(amount);
  const valid = reason.trim() && amountNum > 0;

  function handleSave() {
    issueCreditNote.mutate(
      { ref: invoiceRef, input: { reason: reason.trim(), amount: Math.round(amountNum * 100) } },
      {
        onSuccess: () => {
          setReason("");
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
          <DialogTitle>Issue a credit note</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="credit-amount">Amount (₹)</Label>
            <Input
              id="credit-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="credit-reason">Reason</Label>
            <Input id="credit-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={issueCreditNote.isPending} disabled={!valid} onClick={handleSave}>
            Issue credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

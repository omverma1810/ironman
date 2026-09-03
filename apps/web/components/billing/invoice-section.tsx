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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/icons/icon";
import {
  useInvoices,
  useIssueCreditNote,
  useIssueInvoice,
  useRecordPayment,
} from "@/lib/api/hooks";
import { newIdempotencyKey } from "@/lib/api/client";
import {
  canIssueInvoices,
  canRecordAdjustment,
  canRecordPayment,
  canViewInvoices,
} from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { Invoice, PaymentMethod, Role } from "@/lib/api/types";

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
  const canRead = canViewInvoices(roles);
  // Customer/Field/Ops/Admin/Founder can read the invoice back (docs/06
  // §3.1's "View invoice" row) — a role with none of those (e.g. Viewer)
  // skips this query entirely rather than eating a guaranteed 403 on every
  // order detail page load.
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
          <p className="text-sm text-text-muted">Nothing to show here for your role.</p>
        ) : (
          <AsyncBoundary
            query={invoicesQuery}
            loading={<Skeleton className="h-16" />}
            isEmpty={() => !invoice}
            empty={<p className="text-sm text-text-muted">No invoice issued yet.</p>}
          >
            {() => invoice && <InvoiceSummary invoice={invoice} roles={roles} />}
          </AsyncBoundary>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceSummary({ invoice, roles }: { invoice: Invoice; roles: Role[] | undefined }) {
  const [creditOpen, setCreditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const remainingMinor = invoice.total_minor - invoice.paid_minor;
  const canRecord = canRecordPayment(roles) && remainingMinor > 0;

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
      {invoice.paid_minor > 0 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Paid</span>
          <MoneyText minor={invoice.paid_minor} />
        </div>
      )}
      {remainingMinor > 0 && (
        <div className="flex items-center justify-between text-xs font-medium text-text-primary">
          <span>Balance due</span>
          <MoneyText minor={remainingMinor} />
        </div>
      )}
      <Separator />
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setCreditOpen(true)}>
          Issue credit note
        </Button>
        {canRecord && (
          <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)}>
            Record payment
          </Button>
        )}
      </div>
      <CreditNoteDialog invoiceRef={invoice.ref} open={creditOpen} onOpenChange={setCreditOpen} />
      {canRecord && (
        <RecordPaymentDialog
          invoiceRef={invoice.ref}
          remainingMinor={remainingMinor}
          roles={roles}
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
        />
      )}
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

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI_QR: "UPI (QR at door)",
  GATEWAY: "Gateway",
  CREDIT: "Credit",
  ADJUSTMENT: "Adjustment",
};

export function RecordPaymentDialog({
  invoiceRef,
  remainingMinor,
  roles,
  open,
  onOpenChange,
}: {
  invoiceRef: string;
  remainingMinor: number;
  roles: Role[] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Field staff collect COD/UPI at the door only — ADJUSTMENT is a
  // correction, Admin/Founder territory (docs/06 §3.1, same reasoning as
  // credit notes), same restriction `_FIELD_ALLOWED_METHODS` enforces
  // server-side. Narrower than `PaymentMethod` — GATEWAY/CREDIT aren't
  // recordable through this batch's UI (later batches: 3.5, 3.6).
  type RecordableMethod = "CASH" | "UPI_QR" | "ADJUSTMENT";
  const methods: RecordableMethod[] = canRecordAdjustment(roles)
    ? ["CASH", "UPI_QR", "ADJUSTMENT"]
    : ["CASH", "UPI_QR"];
  const [method, setMethod] = useState<RecordableMethod>("CASH");
  const [amount, setAmount] = useState("");
  const recordPayment = useRecordPayment();

  const amountNum = Number(amount);
  const remainingRupees = remainingMinor / 100;
  const valid = amountNum > 0 && amountNum <= remainingRupees;

  function handleSave() {
    recordPayment.mutate(
      {
        ref: invoiceRef,
        input: {
          method,
          amount: Math.round(amountNum * 100),
          idempotency_key: newIdempotencyKey(),
        },
      },
      {
        onSuccess: () => {
          setAmount("");
          setMethod("CASH");
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as RecordableMethod)}>
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Amount (₹)</Label>
            <Input
              id="payment-amount"
              type="number"
              min={0}
              max={remainingRupees}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              Balance due: <MoneyText minor={remainingMinor} className="inline" />
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={recordPayment.isPending} disabled={!valid} onClick={handleSave}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

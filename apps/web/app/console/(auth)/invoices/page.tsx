"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { MoneyText } from "@/components/patterns/money-text";
import { PageHeader } from "@/components/patterns/page-header";
import { Icon } from "@/components/icons/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoices, useMe, useUninvoicedDeliveries } from "@/lib/api/hooks";
import { buildApiUrl } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { canExportInvoices, canIssueInvoices } from "@/lib/permissions";
import type { Invoice, InvoiceListParams, InvoiceStatus } from "@/lib/api/types";

const STATUS_VARIANT: Record<InvoiceStatus, "neutral" | "info" | "success" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PAID: "success",
  CANCELLED: "danger",
};

const PAGE_LIMIT = 100;

/** Invoices and receivables in one place: who still owes what, filterable
 * by customer, date and status, exportable for the accountant. The Balance
 * column is total less credit notes less payments, computed server-side. */
export default function InvoicesPage() {
  const router = useRouter();
  const me = useMe();
  const roles = me.data?.roles;

  const [status, setStatus] = useState("all");
  const [outstanding, setOutstanding] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  // Debounce so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo<InvoiceListParams>(
    () => ({
      status: status === "all" ? undefined : status,
      outstanding: outstanding || undefined,
      issued_from: from || undefined,
      issued_to: to || undefined,
      search: search || undefined,
    }),
    [status, outstanding, from, to, search]
  );
  const invoicesQuery = useInvoices({ ...params, limit: PAGE_LIMIT });
  const uninvoicedQuery = useUninvoicedDeliveries(canIssueInvoices(roles));
  const uninvoiced = uninvoicedQuery.data ?? [];
  const filtered = status !== "all" || outstanding || !!from || !!to || !!search;

  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch(
        buildApiUrl("/billing/invoices/export/", params as Record<string, string | boolean>),
        { credentials: "include" }
      );
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "invoices.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't export the invoices. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const columns: ColumnDef<Invoice, unknown>[] = [
    {
      accessorKey: "ref",
      header: "Invoice",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-text-primary">
            {row.original.ref}
          </span>
          <span className="text-xs text-text-muted">{row.original.order_ref}</span>
        </div>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Customer",
      cell: ({ row }) => <span className="text-text-secondary">{row.original.customer_name}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      accessorKey: "issued_at",
      header: "Issued",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatDate(row.original.issued_at)}</span>
      ),
    },
    {
      accessorKey: "total_minor",
      header: "Total",
      cell: ({ row }) => <MoneyText minor={row.original.total_minor} />,
    },
    {
      accessorKey: "balance_minor",
      header: "Balance",
      cell: ({ row }) => <BalanceCell invoice={row.original} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        description="Every invoice issued, what's still owed, credit notes and PDFs."
        actions={
          canExportInvoices(roles) ? (
            <Button variant="outline" size="sm" loading={exporting} onClick={handleExport}>
              <Icon name="download" /> Export CSV
            </Button>
          ) : undefined
        }
      />

      {uninvoiced.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-status-warning bg-status-warning-bg px-4 py-3">
          <div className="flex items-start gap-3">
            <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-status-warning" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-status-warning">
                {uninvoiced.length} delivered order{uninvoiced.length === 1 ? "" : "s"} without an
                invoice
              </p>
              <p className="text-xs text-text-secondary">
                Invoices are issued automatically on delivery; these couldn&apos;t be. Open each
                order and issue its invoice.
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-1 pl-7 text-sm">
            {uninvoiced.slice(0, 10).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <Link
                  href={`/console/orders/${o.id}`}
                  className="font-mono text-text-primary underline-offset-2 hover:underline"
                >
                  {o.ref}
                </Link>
                <span className="text-text-secondary">
                  {o.customer_name} · {formatDate(o.delivered_at)}
                </span>
                <MoneyText minor={o.total_minor} />
              </li>
            ))}
            {uninvoiced.length > 10 && (
              <li className="text-xs text-text-muted">…and {uninvoiced.length - 10} more</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-xs">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            aria-label="Search invoices"
            placeholder="Customer, phone, invoice or order…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ISSUED">Issued</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          From
          <Input
            type="date"
            aria-label="Issued from"
            className="w-40"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          To
          <Input
            type="date"
            aria-label="Issued to"
            className="w-40"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button
          variant={outstanding ? "primary" : "outline"}
          size="sm"
          aria-pressed={outstanding}
          onClick={() => setOutstanding((v) => !v)}
        >
          Outstanding only
        </Button>
      </div>

      <AsyncBoundary
        query={invoicesQuery}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
        isEmpty={(data) => data.results.length === 0}
        empty={
          <EmptyState
            icon="file-text"
            title={filtered ? "No invoices match" : "No invoices yet"}
            body={
              filtered
                ? "Try widening the date range or clearing a filter."
                : "Invoices appear here automatically once an order is delivered."
            }
          />
        }
      >
        {(data) => {
          const owed = data.results.reduce((sum, r) => sum + Math.max(r.balance_minor, 0), 0);
          return (
            <>
              <p className="text-sm text-text-secondary">
                {data.results.length} invoice{data.results.length === 1 ? "" : "s"}
                {owed > 0 && (
                  <>
                    {" "}
                    · <MoneyText minor={owed} className="inline font-medium text-text-primary" />{" "}
                    outstanding
                  </>
                )}
              </p>
              <DataTable
                data={data.results}
                columns={columns}
                getRowId={(row) => row.id}
                onRowClick={(row) => router.push(`/console/invoices/${row.ref}`)}
                mobileCard={(row) => (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-medium text-text-primary">
                          {row.ref}
                        </p>
                        <p className="text-xs text-text-muted">{row.customer_name}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {row.status.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>{formatDate(row.issued_at)}</span>
                      <BalanceCell invoice={row} />
                    </div>
                  </div>
                )}
              />
              {data.next && (
                <p className="text-xs text-text-muted">
                  Showing the latest {PAGE_LIMIT} — narrow by date or customer to see the rest.
                </p>
              )}
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}

function BalanceCell({ invoice }: { invoice: Invoice }) {
  if (invoice.balance_minor > 0) {
    return <MoneyText minor={invoice.balance_minor} className="font-medium text-text-primary" />;
  }
  if (invoice.balance_minor < 0) {
    return (
      <span className="text-status-warning">
        Refund due <MoneyText minor={-invoice.balance_minor} className="inline" />
      </span>
    );
  }
  return <span className="text-text-muted">—</span>;
}

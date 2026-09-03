"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { MoneyText } from "@/components/patterns/money-text";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoices } from "@/lib/api/hooks";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { Invoice, InvoiceStatus } from "@/lib/api/types";

const STATUS_VARIANT: Record<InvoiceStatus, "neutral" | "info" | "success" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PAID: "success",
  CANCELLED: "danger",
};

export default function InvoicesPage() {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const invoicesQuery = useInvoices({ status: status === "all" ? undefined : status });

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
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Invoices" description="Every invoice issued, with credit notes and PDFs." />

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="ISSUED">Issued</SelectItem>
          <SelectItem value="PAID">Paid</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>

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
            title="No invoices yet"
            body="Invoices show up here once ops issues them from an order's detail page."
          />
        }
      >
        {(data) => (
          <DataTable
            data={data.results}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => router.push(`/console/invoices/${row.ref}`)}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-medium text-text-primary">{row.ref}</p>
                    <p className="text-xs text-text-muted">{row.customer_name}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[row.status]}>{row.status.toLowerCase()}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>{formatDate(row.issued_at)}</span>
                  <MoneyText minor={row.total_minor} />
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

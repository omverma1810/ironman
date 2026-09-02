"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { useCustomers } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { useState } from "react";
import type { Customer } from "@/lib/api/types";

const STATUS_VARIANT: Record<Customer["status"], "success" | "warning" | "neutral" | "danger"> = {
  ACTIVE: "success",
  LEAD: "neutral",
  LAPSED: "warning",
  BLOCKED: "danger",
};

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const customersQuery = useCustomers({ search: search || undefined });

  const columns: ColumnDef<Customer, unknown>[] = [
    {
      accessorKey: "name",
      header: "Customer",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.original.name || row.original.phone} size="sm" />
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">{row.original.name || "—"}</span>
            <span className="text-xs text-text-muted">{row.original.phone}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
          {row.original.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      accessorKey: "acquisition_channel",
      header: "Channel",
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {row.original.acquisition_channel ? row.original.acquisition_channel.replaceAll("_", " ").toLowerCase() : "—"}
        </span>
      ),
    },
    {
      accessorKey: "lifetime_orders",
      header: "Orders",
      cell: ({ row }) => <span className="tabular-nums">{row.original.lifetime_orders}</span>,
    },
    {
      accessorKey: "last_order_at",
      header: "Last order",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatDate(row.original.last_order_at)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" description="Everyone who's booked or is registered with IronMan." />

      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
        />
        <Input
          placeholder="Search by name or phone…"
          className="max-w-sm pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AsyncBoundary
        query={customersQuery}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
        isEmpty={(data) => data.results.length === 0}
        empty={
          <EmptyState
            icon="users"
            title={search ? "No customers match your search" : "No customers yet"}
            body={
              search
                ? "Try a different name or phone number."
                : "Customers appear here once they place their first order."
            }
          />
        }
      >
        {(data) => (
          <DataTable
            data={data.results}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => router.push(`/console/customers/${row.id}`)}
            mobileCard={(row) => (
              <div className="flex items-center gap-3">
                <Avatar name={row.name || row.phone} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {row.name || row.phone}
                  </span>
                  <span className="text-xs text-text-muted">{row.lifetime_orders} orders</span>
                </div>
                <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
                  {row.status.toLowerCase()}
                </Badge>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

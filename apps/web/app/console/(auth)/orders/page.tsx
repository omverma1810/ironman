"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryStates } from "nuqs";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { StageBadge } from "@/components/patterns/stage-badge";
import { MoneyText } from "@/components/patterns/money-text";
import { DataTable } from "@/components/patterns/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/icons/icon";
import { useOrders } from "@/lib/api/hooks";
import { formatDateTime } from "@/lib/format";
import type { OrderListItem } from "@/lib/api/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "PICKUP_ASSIGNED", label: "Pickup assigned" },
  { value: "AT_HUB", label: "At hub" },
  { value: "IN_PRODUCTION", label: "Pressing" },
  { value: "READY", label: "Ready" },
  { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "CLOSED", label: "Closed" },
];

const CHANNEL_OPTIONS = [
  { value: "all", label: "All channels" },
  { value: "WEB", label: "Web" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "COUNTER", label: "Counter" },
  { value: "PHONE", label: "Phone" },
  { value: "APP", label: "App" },
];

export default function OrdersListPage() {
  const router = useRouter();
  const [filters, setFilters] = useQueryStates({
    status: parseAsString.withDefault("all"),
    channel: parseAsString.withDefault("all"),
    search: parseAsString.withDefault(""),
  });

  const params = useMemo(
    () => ({
      status: filters.status === "all" ? undefined : filters.status,
      channel: filters.channel === "all" ? undefined : filters.channel,
      search: filters.search || undefined,
    }),
    [filters]
  );

  const ordersQuery = useOrders(params);

  const columns: ColumnDef<OrderListItem, unknown>[] = [
    {
      accessorKey: "ref",
      header: "Order",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.ref}</span>
          <span className="text-xs text-text-muted">{formatDateTime(row.original.created_at)}</span>
        </div>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Customer",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-text-primary">{row.original.customer_name}</span>
          <span className="text-xs text-text-muted">{row.original.apartment_name || "—"}</span>
        </div>
      ),
    },
    {
      accessorKey: "channel",
      header: "Channel",
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.channel.toLowerCase()}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <StageBadge status={row.original.status} />
          {row.original.is_late_pickup && (
            <Icon name="alert-triangle" label="Late pickup" className="size-3.5 text-status-danger" />
          )}
        </div>
      ),
    },
    {
      accessorKey: "declared_total_qty",
      header: "Items",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">
          {row.original.verified_total_qty ?? row.original.declared_total_qty}
          {row.original.verified_total_qty == null && (
            <span className="text-text-muted"> (est.)</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "total_minor",
      header: "Total",
      cell: ({ row }) => <MoneyText minor={row.original.total_minor} className="font-medium" />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orders"
        description="Every order, from booking to delivery."
        actions={
          <Button onClick={() => router.push("/console/orders/new")}>
            <Icon name="plus" />
            New order
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            placeholder="Search by order ref, customer name or phone…"
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value || null })}
          />
        </div>
        <Select value={filters.status} onValueChange={(v) => setFilters({ status: v })}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.channel} onValueChange={(v) => setFilters({ channel: v })}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AsyncBoundary
        query={ordersQuery}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
        isEmpty={(data) => data.results.length === 0}
        empty={
          filters.search || filters.status !== "all" || filters.channel !== "all" ? (
            <EmptyState
              icon="search"
              title="No orders match these filters"
              body="Try a different search term, or clear the filters."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilters({ status: null, channel: null, search: null })}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="package-open"
              title="No orders yet"
              body="Orders booked online, by WhatsApp or at the counter will appear here."
              action={
                <Button size="sm" onClick={() => router.push("/console/orders/new")}>
                  <Icon name="plus" /> Create the first order
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <DataTable
            data={data.results}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => router.push(`/console/orders/${row.id}`)}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{row.ref}</p>
                    <p className="text-xs text-text-muted">{row.customer_name}</p>
                  </div>
                  <StageBadge status={row.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>{row.apartment_name || "—"}</span>
                  <MoneyText minor={row.total_minor} className="font-medium text-text-primary" />
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

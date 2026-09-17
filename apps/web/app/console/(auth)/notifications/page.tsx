"use client";

import { useMemo } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/icons/icon";
import { useMe, useNotificationLog } from "@/lib/api/hooks";
import { canViewNotificationLog } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { NotificationRequestRow } from "@/lib/api/types";

const CHANNEL_OPTIONS = [
  { value: "all", label: "All channels" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "PUSH", label: "Push" },
  { value: "EMAIL", label: "Email" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "SENT", label: "Sent" },
  { value: "SKIPPED", label: "Skipped" },
  { value: "FAILED", label: "Failed" },
  { value: "PENDING", label: "Pending" },
];

const STATUS_BADGE: Record<NotificationRequestRow["status"], "success" | "warning" | "danger" | "neutral"> = {
  SENT: "success",
  SKIPPED: "warning",
  FAILED: "danger",
  PENDING: "neutral",
};

export default function NotificationsLogPage() {
  const me = useMe();
  const canView = canViewNotificationLog(me.data?.roles);

  const [filters, setFilters] = useQueryStates({
    search: parseAsString.withDefault(""),
    channel: parseAsString.withDefault("all"),
    status: parseAsString.withDefault("all"),
  });

  const params = useMemo(
    () => ({
      search: filters.search || undefined,
      channel: filters.channel === "all" ? undefined : filters.channel,
      status: filters.status === "all" ? undefined : filters.status,
    }),
    [filters]
  );
  const logQuery = useNotificationLog(params);

  if (!canView) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Notifications"
          description="What was sent, to whom, and whether it was delivered."
        />
        <EmptyState
          icon="lock"
          title="Ops-only"
          body="The notification delivery log is visible to Operator, Admin and Founder accounts."
        />
      </div>
    );
  }

  const columns: ColumnDef<NotificationRequestRow, unknown>[] = [
    {
      accessorKey: "order_ref",
      header: "Order",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.order_ref || "—"}</span>
          <span className="text-xs text-text-muted">{formatDateTime(row.original.created_at)}</span>
        </div>
      ),
    },
    {
      accessorKey: "template_code",
      header: "Event",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.original.template_code}</span>
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
        <div className="flex flex-col gap-0.5">
          <Badge variant={STATUS_BADGE[row.original.status]}>{row.original.status}</Badge>
          {row.original.skipped_reason && (
            <span className="text-xs text-text-muted">{row.original.skipped_reason}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "deliveries",
      header: "Delivery",
      cell: ({ row }) => {
        const latest = row.original.deliveries[0];
        if (!latest) return <span className="text-text-muted">—</span>;
        return (
          <div className="flex flex-col">
            <span className="text-text-secondary">
              {latest.provider} · {latest.status}
            </span>
            {latest.error && <span className="text-xs text-status-danger">{latest.error}</span>}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="What was sent, to whom, and whether it was delivered."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            placeholder="Search by order ref…"
            className="w-56 pl-8"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value || null })}
          />
        </div>
        <Select value={filters.channel} onValueChange={(v) => setFilters({ channel: v })}>
          <SelectTrigger className="w-40">
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
        <Select value={filters.status} onValueChange={(v) => setFilters({ status: v })}>
          <SelectTrigger className="w-40">
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
      </div>

      <AsyncBoundary
        query={logQuery}
        loading={<div className="h-64 animate-pulse rounded-lg bg-surface-sunken" />}
        isEmpty={(data) => data.results.length === 0}
        empty={
          <EmptyState
            icon="bell"
            title="No notifications yet"
            body="Lifecycle messages (booking confirmed, out for delivery, delivered) will show up here as orders move."
          />
        }
      >
        {(data) => (
          <DataTable
            data={data.results}
            columns={columns}
            getRowId={(row) => row.id}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2 rounded-lg border border-border-default p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">{row.order_ref || "—"}</span>
                  <Badge variant={STATUS_BADGE[row.status]}>{row.status}</Badge>
                </div>
                <span className="text-sm text-text-secondary">
                  {row.template_code} · {row.channel.toLowerCase()}
                </span>
                <span className="text-xs text-text-muted">{formatDateTime(row.created_at)}</span>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

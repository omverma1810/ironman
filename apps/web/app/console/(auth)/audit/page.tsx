"use client";

import { useMemo } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Icon } from "@/components/icons/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { identityApi } from "@/lib/api/endpoints";
import { useAuditLog, useMe } from "@/lib/api/hooks";
import type { AuditEventRow } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { canViewAuditLog } from "@/lib/permissions";

// The things docs/06 §3.3 says are audited, by the object they land on.
const OBJECT_TYPES = [
  { value: "all", label: "Everything" },
  { value: "Order", label: "Orders" },
  { value: "Invoice", label: "Invoices & payments" },
  { value: "PriceList", label: "Price lists" },
  { value: "CommissionRule", label: "Commission rules" },
  { value: "Settlement", label: "Settlements" },
  { value: "CashHandover", label: "Cash handovers" },
  { value: "User", label: "Accounts & sign-ins" },
  { value: "DeletionRequest", label: "Account deletions" },
];

/** "field: old → new" for each value that changed, so a row reads at a glance. */
function changes(row: AuditEventRow): string[] {
  const keys = new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})]);
  const show = (v: unknown) =>
    v === undefined || v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return [...keys].map((k) => {
    const before = row.before?.[k];
    const after = row.after?.[k];
    return before === undefined ? `${k}: ${show(after)}` : `${k}: ${show(before)} → ${show(after)}`;
  });
}

function ChangeSummary({ row }: { row: AuditEventRow }) {
  const lines = changes(row);
  if (lines.length === 0) return <span className="text-text-muted">—</span>;
  const [first, ...rest] = lines;
  return (
    <div className="flex max-w-md flex-col gap-0.5 text-xs text-text-secondary">
      <span className="wrap-break-word">{first}</span>
      {rest.length > 0 && (
        <details>
          <summary className="cursor-pointer text-text-muted">{rest.length} more</summary>
          <div className="flex flex-col gap-0.5 pt-1">
            {rest.map((line) => (
              <span key={line} className="wrap-break-word">
                {line}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const me = useMe();
  const [filters, setFilters] = useQueryStates({
    action: parseAsString.withDefault(""),
    object_type: parseAsString.withDefault("all"),
    object_id: parseAsString.withDefault(""),
    from: parseAsString.withDefault(""),
    to: parseAsString.withDefault(""),
  });
  const params = useMemo(
    () => ({
      action: filters.action || undefined,
      object_type: filters.object_type === "all" ? undefined : filters.object_type,
      object_id: filters.object_id || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    [filters]
  );
  const log = useAuditLog(params);

  if (me.data && !canViewAuditLog(me.data.roles)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Audit log" />
        <EmptyState
          icon="lock"
          title="Admin and Founder only"
          body="The audit log is available to Admin and Founder accounts."
        />
      </div>
    );
  }

  const columns: ColumnDef<AuditEventRow, unknown>[] = [
    {
      accessorKey: "created_at",
      header: "When",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-text-secondary tabular-nums">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: "actor_name",
      header: "Who",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-text-primary">{row.original.actor_name}</span>
          {row.original.actor_role && (
            <span className="text-xs text-text-muted capitalize">
              {row.original.actor_role.toLowerCase()}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: "What",
      cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
    },
    {
      accessorKey: "object_id",
      header: "On",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-text-secondary">{row.original.object_type}</span>
          <span className="font-mono text-xs text-text-muted">{row.original.object_id}</span>
        </div>
      ),
    },
    {
      id: "change",
      header: "Change",
      cell: ({ row }) => <ChangeSummary row={row.original} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Who changed prices, money, commission and accounts, and when. Entries can't be edited or deleted."
        actions={
          <Button variant="secondary" asChild>
            <a href={identityApi.auditCsvUrl(params)}>
              <Icon name="download" />
              Export CSV
            </a>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Input
            id="audit-action"
            placeholder="e.g. cancelled"
            className="w-44"
            value={filters.action}
            onChange={(e) => setFilters({ action: e.target.value || null })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-type">About</Label>
          <Select value={filters.object_type} onValueChange={(v) => setFilters({ object_type: v })}>
            <SelectTrigger id="audit-type" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJECT_TYPES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-object">Reference</Label>
          <Input
            id="audit-object"
            placeholder="Order ref or id"
            className="w-44"
            value={filters.object_id}
            onChange={(e) => setFilters({ object_id: e.target.value || null })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="date"
            className="w-40"
            value={filters.from}
            onChange={(e) => setFilters({ from: e.target.value || null })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-to">To</Label>
          <Input
            id="audit-to"
            type="date"
            className="w-40"
            value={filters.to}
            onChange={(e) => setFilters({ to: e.target.value || null })}
          />
        </div>
      </div>

      <AsyncBoundary
        query={log}
        loading={<div className="h-64 animate-pulse rounded-lg bg-surface-sunken" />}
        isEmpty={(data) => data.results.length === 0}
        empty={
          <EmptyState
            icon="file-text"
            title="Nothing matches"
            body="No audited changes match these filters. Clear a filter or widen the dates."
          />
        }
      >
        {(data) => (
          <div className="flex flex-col gap-3">
            <DataTable
              data={data.results}
              columns={columns}
              getRowId={(row) => row.id}
              mobileCard={(row) => (
                <div className="flex flex-col gap-2 rounded-lg border border-border-default p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{row.action}</Badge>
                    <span className="text-xs text-text-muted tabular-nums">
                      {formatDateTime(row.created_at)}
                    </span>
                  </div>
                  <span className="text-sm text-text-secondary">
                    {row.actor_name} · {row.object_type} {row.object_id}
                  </span>
                  <ChangeSummary row={row} />
                </div>
              )}
            />
            {data.next && (
              <p className="text-sm text-text-muted">
                Showing the latest {data.results.length} matching entries. Narrow the filters, or
                export the CSV to get all of them.
              </p>
            )}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

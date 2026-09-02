"use client";

import { useMemo, useState } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import {
  ExceptionSeverityBadge,
  ExceptionStatusBadge,
  SlaBadge,
  exceptionKindLabel,
} from "@/components/patterns/exception-badges";
import { ExceptionDetailDialog } from "@/components/exceptions/exception-detail-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExceptions } from "@/lib/api/hooks";
import { formatRelative } from "@/lib/format";
import type { OrderException } from "@/lib/api/types";

const KIND_OPTIONS = [
  { value: "all", label: "All kinds" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "LOST", label: "Lost" },
  { value: "MISSING", label: "Missing" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "REPRESS", label: "Re-press requested" },
  { value: "COMPLAINT", label: "Complaint" },
];

const SEVERITY_OPTIONS = [
  { value: "all", label: "All severities" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export default function ExceptionsPage() {
  const [filters, setFilters] = useQueryStates({
    status: parseAsString.withDefault("open"),
    kind: parseAsString.withDefault("all"),
    severity: parseAsString.withDefault("all"),
  });
  const [selected, setSelected] = useState<OrderException | null>(null);

  const params = useMemo(
    () => ({
      // "open" isn't a real backend status — it's this queue's default
      // view (OPEN + INVESTIGATING), fetched unfiltered and narrowed
      // client-side so the tab can show both at once.
      status: filters.status === "all" || filters.status === "open" ? undefined : filters.status,
      kind: filters.kind === "all" ? undefined : filters.kind,
      severity: filters.severity === "all" ? undefined : filters.severity,
    }),
    [filters]
  );
  const exceptionsQuery = useExceptions(params);

  const rows = useMemo(() => {
    const results = exceptionsQuery.data?.results ?? [];
    if (filters.status !== "open") return results;
    return results.filter((e) => e.status === "OPEN" || e.status === "INVESTIGATING");
  }, [exceptionsQuery.data, filters.status]);

  const columns: ColumnDef<OrderException, unknown>[] = [
    {
      accessorKey: "order_ref",
      header: "Order",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.order_ref}</span>
          <span className="text-xs text-text-muted">{formatRelative(row.original.created_at)}</span>
        </div>
      ),
    },
    {
      accessorKey: "kind",
      header: "Issue",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-text-primary">{exceptionKindLabel(row.original.kind)}</span>
          <span className="max-w-64 truncate text-xs text-text-muted">
            {row.original.description}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => <ExceptionSeverityBadge severity={row.original.severity} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <ExceptionStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "sla_due_at",
      header: "SLA",
      cell: ({ row }) => <SlaBadge slaDueAt={row.original.sla_due_at} status={row.original.status} />,
    },
    {
      accessorKey: "assigned_to_name",
      header: "Assigned to",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.original.assigned_to_name || "Unassigned"}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exceptions"
        description="Damaged, lost, missing and disputed items — triaged with an SLA, not a WhatsApp thread."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filters.status} onValueChange={(v) => setFilters({ status: v })}>
          <TabsList>
            <TabsTrigger value="open">Open queue</TabsTrigger>
            <TabsTrigger value="RESOLVED">Resolved</TabsTrigger>
            <TabsTrigger value="WRITTEN_OFF">Written off</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Select value={filters.kind} onValueChange={(v) => setFilters({ kind: v })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.severity} onValueChange={(v) => setFilters({ severity: v })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AsyncBoundary
        query={exceptionsQuery}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            icon="alert-triangle"
            title={filters.status === "open" ? "Nothing open" : "Nothing here"}
            body={
              filters.status === "open"
                ? "No damaged, lost or disputed items waiting on a resolution right now."
                : "No exceptions match this filter."
            }
          />
        }
      >
        {() => (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => setSelected(row)}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{row.order_ref}</p>
                    <p className="text-xs text-text-muted">{exceptionKindLabel(row.kind)}</p>
                  </div>
                  <ExceptionStatusBadge status={row.status} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <ExceptionSeverityBadge severity={row.severity} />
                  <SlaBadge slaDueAt={row.sla_due_at} status={row.status} />
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>

      {selected && (
        <ExceptionDetailDialog
          exception={selected}
          open={!!selected}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </div>
  );
}


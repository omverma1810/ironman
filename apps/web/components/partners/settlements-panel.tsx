"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { settlementsApi } from "@/lib/api/endpoints";
import { useCancelSettlement, useSettlements } from "@/lib/api/hooks";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import type { Settlement, SettlementStatus } from "@/lib/api/types";
import { MarkPaidDialog } from "./mark-paid-dialog";

const STATUS_BADGE: Record<
  SettlementStatus,
  { label: string; variant: "warning" | "success" | "neutral" }
> = {
  PENDING: { label: "Awaiting payment", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

function period(s: Settlement) {
  return s.period_start
    ? `${formatDate(s.period_start)} – ${formatDate(s.period_end)}`
    : `Up to ${formatDate(s.period_end)}`;
}

export function SettlementsPanel({ canManage }: { canManage: boolean }) {
  const settlementsQuery = useSettlements();
  const cancel = useCancelSettlement();
  const [paying, setPaying] = useState<Settlement | null>(null);
  const settlements = settlementsQuery.data?.results ?? [];

  const statementLink = (s: Settlement) => (
    <Button variant="outline" size="sm" asChild>
      <a href={settlementsApi.statementUrl(s.id)} target="_blank" rel="noreferrer">
        <Icon name="file-text" /> Statement
      </a>
    </Button>
  );

  const columns: ColumnDef<Settlement, unknown>[] = [
    {
      accessorKey: "ref",
      header: "Settlement",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-text-primary">
            {row.original.ref}
          </span>
          <span className="text-xs text-text-muted">{period(row.original)}</span>
        </div>
      ),
    },
    {
      accessorKey: "partner_name",
      header: "Partner",
      cell: ({ row }) => <span className="text-text-secondary">{row.original.partner_name}</span>,
    },
    {
      accessorKey: "total_minor",
      header: "Total",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary tabular-nums">
            {formatMoneyMinor(row.original.total_minor)}
          </span>
          <span className="text-xs text-text-muted">{row.original.accrual_count} orders</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <span>
              <Badge variant={STATUS_BADGE[s.status].variant} dot>
                {STATUS_BADGE[s.status].label}
              </Badge>
            </span>
            {s.paid_at && (
              <span className="text-xs text-text-muted">
                {formatDate(s.paid_at)} · {s.payment_method}
                {s.payment_ref ? ` · ${s.payment_ref}` : ""}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            {statementLink(s)}
            {canManage && s.status === "PENDING" && (
              <>
                <Button size="sm" onClick={() => setPaying(s)}>
                  Mark paid
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={cancel.isPending && cancel.variables === s.id}
                  onClick={() => cancel.mutate(s.id)}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AsyncBoundary
        query={settlementsQuery}
        loading={<Skeleton className="h-28" />}
        isEmpty={() => settlements.length === 0}
        empty={
          <EmptyState
            icon="wallet"
            title="No settlements yet"
            body="Open a partner's commission from the Partners tab and settle their unpaid balance — you get a statement to pay them from."
          />
        }
      >
        {() => (
          <DataTable
            data={settlements}
            columns={columns}
            getRowId={(row) => row.id}
            mobileCard={(s) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-medium text-text-primary">{s.ref}</p>
                    <p className="text-xs text-text-muted">{s.partner_name}</p>
                  </div>
                  <Badge variant={STATUS_BADGE[s.status].variant} dot>
                    {STATUS_BADGE[s.status].label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium tabular-nums">
                    {formatMoneyMinor(s.total_minor)}
                  </span>
                  <div className="flex gap-2">
                    {statementLink(s)}
                    {canManage && s.status === "PENDING" && (
                      <Button size="sm" onClick={() => setPaying(s)}>
                        Mark paid
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
      <MarkPaidDialog settlement={paying} onOpenChange={(open) => !open && setPaying(null)} />
    </div>
  );
}

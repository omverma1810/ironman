"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ConfirmHandoverDialog, RecordDepositDialog } from "@/components/billing/cash-dialogs";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { MoneyText } from "@/components/patterns/money-text";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCashReconciliation, useHandovers, useMe } from "@/lib/api/hooks";
import { canManageCashCustody, canViewCashReconciliation } from "@/lib/permissions";
import { formatDateTime, todayIsoIST } from "@/lib/format";
import type { CashHandover, CashReconciliationRow } from "@/lib/api/types";

export default function CashReconciliationPage() {
  const meQuery = useMe();
  const roles = meQuery.data?.roles;
  const showHandovers = canManageCashCustody(roles);
  const showReconciliation = canViewCashReconciliation(roles);

  const [confirming, setConfirming] = useState<CashHandover | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cash custody"
        description="Riders' cash-in-hand, hub handovers and the daily reconciliation across the hub (docs/08 batch 3.3)."
        actions={
          showHandovers ? (
            <Button onClick={() => setDepositOpen(true)}>Record deposit</Button>
          ) : undefined
        }
      />

      {showHandovers && <PendingHandovers onConfirm={setConfirming} />}
      {showReconciliation && <Reconciliation />}

      <ConfirmHandoverDialog
        handover={confirming}
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
      <RecordDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
    </div>
  );
}

function PendingHandovers({ onConfirm }: { onConfirm: (handover: CashHandover) => void }) {
  const handoversQuery = useHandovers({ status: "PENDING" });
  const rows = [...(handoversQuery.data ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const columns: ColumnDef<CashHandover, unknown>[] = [
    {
      accessorKey: "from_user_name",
      header: "From",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.from_user_name}</span>
          <span className="text-xs text-text-muted">{formatDateTime(row.original.created_at)}</span>
        </div>
      ),
    },
    {
      accessorKey: "to_user_name",
      header: "To",
      cell: ({ row }) => <span className="text-text-secondary">{row.original.to_user_name}</span>,
    },
    {
      accessorKey: "declared_amount_minor",
      header: "Declared",
      cell: ({ row }) => <MoneyText minor={row.original.declared_amount_minor} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" onClick={() => onConfirm(row.original)}>
          Confirm
        </Button>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-base font-semibold text-text-primary">Pending handovers</h2>
      <AsyncBoundary
        query={handoversQuery}
        loading={<Skeleton className="h-24" />}
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            icon="wallet"
            title="Nothing waiting"
            body="No rider has a cash handover waiting to be confirmed right now."
          />
        }
      >
        {() => (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">
                    {row.from_user_name} → {row.to_user_name}
                  </span>
                  <MoneyText minor={row.declared_amount_minor} className="font-medium" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">{formatDateTime(row.created_at)}</span>
                  <Button size="sm" onClick={() => onConfirm(row)}>
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </section>
  );
}

function Reconciliation() {
  const [date, setDate] = useState(todayIsoIST);
  const reconciliationQuery = useCashReconciliation(date);
  const rows = reconciliationQuery.data ?? [];

  const columns: ColumnDef<CashReconciliationRow, unknown>[] = [
    {
      accessorKey: "rider_name",
      header: "Rider",
      cell: ({ row }) => <span className="font-medium text-text-primary">{row.original.rider_name}</span>,
    },
    {
      accessorKey: "collected_minor",
      header: "Collected",
      cell: ({ row }) => <MoneyText minor={row.original.collected_minor} />,
    },
    {
      accessorKey: "received_minor",
      header: "Handed over",
      cell: ({ row }) => <MoneyText minor={row.original.received_minor} />,
    },
    {
      accessorKey: "variance_minor",
      header: "Variance",
      cell: ({ row }) => {
        const v = row.original.variance_minor;
        if (v === 0) return <span className="text-text-muted">—</span>;
        return (
          <Badge variant={v < 0 ? "danger" : "warning"}>
            {v < 0 ? "Short" : "Over"} <MoneyText minor={Math.abs(v)} className="inline" />
          </Badge>
        );
      },
    },
    {
      accessorKey: "outstanding_minor",
      header: "Still with rider",
      cell: ({ row }) => <MoneyText minor={row.original.outstanding_minor} />,
    },
    {
      accessorKey: "pending_handovers",
      header: "Pending",
      cell: ({ row }) =>
        row.original.pending_handovers > 0 ? (
          <Badge variant="warning">{row.original.pending_handovers}</Badge>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-text-primary">Reconciliation</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="reconciliation-date" className="sr-only">
            Date
          </Label>
          <Input
            id="reconciliation-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
      </div>
      <AsyncBoundary
        query={reconciliationQuery}
        loading={<Skeleton className="h-40" />}
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            icon="wallet"
            title="No cash activity"
            body="No rider collected, declared or handed over cash on this day."
          />
        }
      >
        {() => (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.rider_id}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">{row.rider_name}</span>
                  {row.pending_handovers > 0 && (
                    <Badge variant="warning">{row.pending_handovers} pending</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary">
                  <span>
                    Collected: <MoneyText minor={row.collected_minor} className="inline" />
                  </span>
                  <span>
                    Handed over: <MoneyText minor={row.received_minor} className="inline" />
                  </span>
                  <span>
                    Outstanding: <MoneyText minor={row.outstanding_minor} className="inline" />
                  </span>
                  {row.variance_minor !== 0 && (
                    <span className={row.variance_minor < 0 ? "text-status-danger" : "text-status-warning"}>
                      {row.variance_minor < 0 ? "Short" : "Over"} by{" "}
                      <MoneyText minor={Math.abs(row.variance_minor)} className="inline" />
                    </span>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </section>
  );
}

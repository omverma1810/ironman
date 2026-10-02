"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useStockMovements } from "@/lib/api/hooks";
import { formatDateTime, formatMoneyMinor } from "@/lib/format";
import type { MovementKind, StockItem, StockMovement } from "@/lib/api/types";

const ALL = "all";
const LEDGER_LIMIT = 100;

const KIND_LABEL: Record<MovementKind, string> = {
  RECEIPT: "Receipt",
  ISSUE: "Issue",
  ADJUSTMENT: "Correction",
  WASTAGE: "Wastage",
  RETURN: "Return",
};

/** Admin/Founder-only audit trail of every stock change (docs/04 §3.8
 * `[A][B]`) — receipts, auto-issues on PACKED, wastage, corrections. The
 * ledger is the source of truth `StockLevel` is derived from, so this is
 * where "why is the count off?" gets answered. */
export function MovementLedger({ items }: { items: StockItem[] }) {
  const [item, setItem] = useState(ALL);
  const query = useStockMovements({
    item: item === ALL ? undefined : item,
    limit: LEDGER_LIMIT,
  });

  const columns = useMemo<ColumnDef<StockMovement, unknown>[]>(
    () => [
      {
        accessorKey: "at",
        header: "When",
        cell: ({ row }) => (
          <span className="text-text-secondary tabular-nums">
            {formatDateTime(row.original.at)}
          </span>
        ),
      },
      {
        accessorKey: "sku",
        header: "Item",
        cell: ({ row }) => (
          <span className="font-medium text-text-primary">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "kind",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={row.original.delta_qty >= 0 ? "success" : "neutral"}>
            {KIND_LABEL[row.original.kind]}
          </Badge>
        ),
      },
      {
        accessorKey: "delta_qty",
        header: "Qty",
        cell: ({ row }) => (
          <span className="font-medium text-text-primary tabular-nums">
            {row.original.delta_qty > 0 ? "+" : ""}
            {row.original.delta_qty}
          </span>
        ),
      },
      {
        accessorKey: "unit_cost_minor",
        header: "Unit cost",
        cell: ({ row }) => (
          <span className="text-text-secondary tabular-nums">
            {row.original.unit_cost_minor != null
              ? formatMoneyMinor(row.original.unit_cost_minor)
              : "—"}
          </span>
        ),
      },
      {
        id: "detail",
        header: "Detail",
        cell: ({ row }) => {
          const m = row.original;
          const bits = [m.supplier, m.invoice_ref && `Inv ${m.invoice_ref}`, m.note].filter(
            Boolean
          );
          return <span className="text-xs text-text-muted">{bits.join(" · ") || "—"}</span>;
        },
      },
      {
        accessorKey: "actor_name",
        header: "By",
        cell: ({ row }) => (
          <span className="text-text-secondary">{row.original.actor_name || "System"}</span>
        ),
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label>Item</Label>
        <Select value={item} onValueChange={setItem}>
          <SelectTrigger aria-label="Filter ledger by item">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All items</SelectItem>
            {items.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.sku} — {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AsyncBoundary
        query={query}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        }
        isEmpty={(data) => data.results.length === 0}
        empty={
          <EmptyState
            icon="package-open"
            title="No stock movements yet"
            body="Receipts, issues, wastage and corrections will appear here as they happen."
          />
        }
      >
        {(data) => (
          <>
            <DataTable
              data={data.results}
              columns={columns}
              getRowId={(row) => row.id}
              mobileCard={(m) => (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">{m.sku}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {m.delta_qty > 0 ? "+" : ""}
                      {m.delta_qty}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {KIND_LABEL[m.kind]} · {formatDateTime(m.at)} · {m.actor_name || "System"}
                  </span>
                </div>
              )}
            />
            {data.next && (
              <p className="text-xs text-text-muted">
                Showing the latest {LEDGER_LIMIT} movements — filter by item to narrow down.
              </p>
            )}
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

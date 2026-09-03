"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AdjustStockDialog } from "@/components/supplies/adjust-stock-dialog";
import { ReceiveStockDialog } from "@/components/supplies/receive-stock-dialog";
import { StockItemDialog } from "@/components/supplies/stock-item-dialog";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { useMe, useReorderAlerts, useStockItems, useStockLevels } from "@/lib/api/hooks";
import { canSeeStockLedger } from "@/lib/permissions";
import { formatMoneyMinor } from "@/lib/format";
import type { StockItem, StockLevel } from "@/lib/api/types";

type Row = StockItem & { level: StockLevel | undefined };

export default function SuppliesPage() {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const meQuery = useMe();
  const itemsQuery = useStockItems();
  const levelsQuery = useStockLevels();
  const alertsQuery = useReorderAlerts();

  const items = itemsQuery.data?.results ?? [];
  const levelByItem = useMemo(() => {
    const map = new Map<string, StockLevel>();
    for (const level of levelsQuery.data?.results ?? []) map.set(level.stock_item, level);
    return map;
  }, [levelsQuery.data]);

  const editingItem =
    editingId && editingId !== "new" ? (items.find((i) => i.id === editingId) ?? null) : null;

  const rows = useMemo<Row[]>(() => {
    const withLevels = (itemsQuery.data?.results ?? []).map((item) => ({
      ...item,
      level: levelByItem.get(item.id),
    }));
    if (!search.trim()) return withLevels;
    const q = search.trim().toLowerCase();
    return withLevels.filter(
      (r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [itemsQuery.data, levelByItem, search]);

  const alerts = alertsQuery.data ?? [];
  const showLedger = canSeeStockLedger(meQuery.data?.roles);

  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: "name",
      header: "Item",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.original.name}</span>
          <span className="text-xs text-text-muted">{row.original.sku}</span>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => <span className="text-text-secondary">{row.original.category}</span>,
    },
    {
      accessorKey: "qty_on_hand",
      header: "On hand",
      cell: ({ row }) => {
        const level = row.original.level;
        const low = !!level && level.qty_on_hand <= row.original.reorder_level;
        return (
          <div className="flex items-center gap-2">
            <span className="text-text-primary tabular-nums">{level?.qty_on_hand ?? 0}</span>
            <span className="text-xs text-text-muted">/ {row.original.reorder_level} reorder</span>
            {low && (
              <Badge variant="warning" dot>
                Low
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "avg_unit_cost_minor",
      header: "Avg cost",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">
          {row.original.level ? formatMoneyMinor(row.original.level.avg_unit_cost_minor) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="success" dot>
            Active
          </Badge>
        ) : (
          <Badge variant="neutral" dot>
            Inactive
          </Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Supplies"
        description="Stock items, receipts, issues and reorder levels."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
              Adjust stock
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReceiveOpen(true)}>
              Receive stock
            </Button>
            <Button size="sm" onClick={() => setEditingId("new")}>
              <Icon name="plus" /> New item
            </Button>
          </div>
        }
      />

      {alerts.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-status-warning bg-status-warning-bg px-4 py-3">
          <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-status-warning" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-status-warning">
              {alerts.length} item{alerts.length === 1 ? "" : "s"} at or below reorder level
            </p>
            <p className="text-xs text-text-secondary">
              {alerts.map((a) => `${a.sku} (${a.qty_on_hand} left)`).join(", ")}
            </p>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
        />
        <Input
          placeholder="Search by SKU or name…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AsyncBoundary
        query={itemsQuery}
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
            icon="package-open"
            title={search ? "No items match" : "No stock items yet"}
            body={
              search
                ? "Try a different search term."
                : "Add hangers, covers, bags and other consumables to start tracking stock."
            }
            action={
              !search ? (
                <Button size="sm" onClick={() => setEditingId("new")}>
                  <Icon name="plus" /> Add the first item
                </Button>
              ) : undefined
            }
          />
        }
      >
        {() => (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => setEditingId(row.id)}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{row.name}</p>
                    <p className="text-xs text-text-muted">{row.sku}</p>
                  </div>
                  {row.is_active ? (
                    <Badge variant="success" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="neutral" dot>
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>
                    {row.level?.qty_on_hand ?? 0} on hand / {row.reorder_level} reorder
                  </span>
                  <span>{row.category}</span>
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>

      {!showLedger && (
        <p className="text-xs text-text-muted">
          The stock movement ledger is visible to Ops/Admin and Founder accounts.
        </p>
      )}

      <StockItemDialog
        item={editingItem}
        open={editingId !== null}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
      <ReceiveStockDialog items={items} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <AdjustStockDialog items={items} open={adjustOpen} onOpenChange={setAdjustOpen} />
    </div>
  );
}

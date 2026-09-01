"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons/icon";

/**
 * The DataTable pattern (docs/05 §2.3). A real `<table>` with sticky
 * header on desktop; below `md` every row renders through `mobileCard`
 * instead — horizontal scrolling on a phone is a failure state, not a
 * responsive strategy (docs/05 §3).
 */
export function DataTable<TData>({
  data,
  columns,
  mobileCard,
  onRowClick,
  getRowId,
  emptyFallback,
}: {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  mobileCard: (row: TData) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  emptyFallback?: React.ReactNode;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId as never,
  });

  if (data.length === 0 && emptyFallback) {
    return <>{emptyFallback}</>;
  }

  return (
    <>
      {/* Desktop / tablet: real table, sticky header */}
      <div className="hidden overflow-x-auto rounded-lg border border-border-default bg-surface-raised md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-sunken">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border-b border-border-default px-4 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-text-muted uppercase"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={cn(
                  "border-b border-border-subtle last:border-0",
                  onRowClick && "cursor-pointer hover:bg-surface-sunken"
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {data.map((row) => (
          <div
            key={getRowId ? getRowId(row) : JSON.stringify(row)}
            onClick={() => onRowClick?.(row)}
            className={cn(
              "rounded-lg border border-border-default bg-surface-raised p-4",
              onRowClick && "cursor-pointer active:bg-surface-sunken"
            )}
          >
            {mobileCard(row)}
          </div>
        ))}
      </div>
    </>
  );
}

export function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active?: boolean;
  direction?: "asc" | "desc";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-text-primary"
    >
      {label}
      {active && (
        <Icon
          name={direction === "asc" ? "chevron-up" : "chevron-down"}
          className="size-3"
        />
      )}
    </button>
  );
}

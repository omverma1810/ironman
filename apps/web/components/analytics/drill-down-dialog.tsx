"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/icons/icon";
import { analyticsApi } from "@/lib/api/endpoints";
import { useMetricRows } from "@/lib/api/hooks";
import type { MetricKey } from "@/lib/api/types";
import { cellValue, columnLabel, formatMetric } from "./metric-format";

// Identifiers the API sends for linking, not for reading.
const HIDDEN = new Set(["customer"]);

export function DrillDownDialog({
  metric,
  week,
  hub,
  onOpenChange,
}: {
  metric: MetricKey | null;
  week: string;
  hub?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useMetricRows(metric, { week, hub });
  const rows = query.data?.rows ?? [];
  const columns = rows.length ? Object.keys(rows[0]).filter((k) => !HIDDEN.has(k)) : [];

  return (
    <Dialog open={!!metric} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{query.data?.label ?? "Loading…"}</DialogTitle>
          <DialogDescription>
            {query.data && metric
              ? `${formatMetric(metric, query.data.value)} — the ${rows.length} row${rows.length === 1 ? "" : "s"} this figure was worked out from.`
              : "The rows behind this figure."}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-40" />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Nothing for this week.</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border border-border-default">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-raised text-left text-xs text-text-muted">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                      {columnLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-border-subtle">
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {cellValue(c, row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {metric && rows.length > 0 && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <a href={analyticsApi.csvUrl(metric, { week, hub })}>
                <Icon name="download" /> Download CSV
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

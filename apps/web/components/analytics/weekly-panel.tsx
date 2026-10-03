"use client";

import { useState } from "react";
import { DrillDownDialog } from "@/components/analytics/drill-down-dialog";
import { detailLine, formatMetric, LOWER_IS_BETTER } from "@/components/analytics/metric-format";
import { Sparkline } from "@/components/analytics/sparkline";
import { Icon } from "@/components/icons/icon";
import { ErrorState } from "@/components/patterns/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { analyticsApi } from "@/lib/api/endpoints";
import { useDefaultHub, useWeeklyMetrics } from "@/lib/api/hooks";
import { addDaysIso, formatDate, todayIsoIST } from "@/lib/format";
import type { MetricKey, MetricTile } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Monday of the week containing an ISO date (business week is Mon–Sun). */
function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysIso(iso, -((day + 6) % 7));
}

function Delta({ tile }: { tile: MetricTile }) {
  const { value, previous } = tile;
  if (value === null || value === undefined || previous === null || previous === undefined) {
    return <span className="text-xs text-text-muted">No comparison</span>;
  }
  const diff = value - previous;
  if (diff === 0) return <span className="text-xs text-text-muted">Same as last week</span>;
  const better = LOWER_IS_BETTER.includes(tile.key) ? diff < 0 : diff > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        better ? "text-status-success" : "text-status-danger"
      )}
    >
      <Icon name={diff > 0 ? "chevron-up" : "chevron-down"} className="size-3" />
      {formatMetric(tile.key, Math.abs(diff))} vs last week
    </span>
  );
}

function Tile({ tile, onOpen }: { tile: MetricTile; onOpen: () => void }) {
  if (tile.restricted) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border-default p-4">
        <span className="text-sm font-medium text-text-secondary">{tile.label}</span>
        <span className="flex items-center gap-1.5 text-sm text-text-muted">
          <Icon name="lock" className="size-4" /> Founder only
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface-raised p-4 text-left shadow-xs transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-border-focus"
    >
      <span className="text-sm font-medium text-text-secondary">{tile.label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="font-display text-2xl font-semibold text-text-primary tabular-nums">
          {formatMetric(tile.key, tile.value)}
        </span>
        <Sparkline values={(tile.trend ?? []).map((p) => p.value)} />
      </div>
      <Delta tile={tile} />
      <span className="text-xs text-text-muted">{detailLine(tile)}</span>
    </button>
  );
}

export function WeeklyPanel() {
  const { hubId: hub, hubsQuery } = useDefaultHub();
  const thisWeek = mondayOf(todayIsoIST());
  const [week, setWeek] = useState(thisWeek);
  const [open, setOpen] = useState<MetricKey | null>(null);
  const query = useWeeklyMetrics({ week, hub });

  const weekEnd = addDaysIso(week, 6);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label="Previous week"
          onClick={() => setWeek(addDaysIso(week, -7))}
        >
          <Icon name="chevron-left" />
        </Button>
        <span className="min-w-56 text-center text-sm font-medium text-text-primary">
          {formatDate(week)} – {formatDate(weekEnd)}
          {week === thisWeek && <span className="ml-2 text-xs text-text-muted">(this week)</span>}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Next week"
          disabled={week >= thisWeek}
          onClick={() => setWeek(addDaysIso(week, 7))}
        >
          <Icon name="chevron-right" />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={analyticsApi.pdfUrl({ week, hub })} target="_blank" rel="noreferrer">
              <Icon name="printer" /> PDF
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={analyticsApi.excelUrl({ week, hub })}>
              <Icon name="download" /> Excel
            </a>
          </Button>
        </div>
      </div>

      {hubsQuery.error || query.error ? (
        <ErrorState
          error={hubsQuery.error ?? query.error}
          onRetry={() => (hubsQuery.error ? hubsQuery.refetch() : query.refetch())}
        />
      ) : !query.data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
            query.isFetching && "opacity-60"
          )}
        >
          {query.data.tiles.map((tile) => (
            <Tile key={tile.key} tile={tile} onOpen={() => setOpen(tile.key)} />
          ))}
        </div>
      )}

      <p className="text-xs text-text-muted">
        A customer counts as new on their first delivered order. Money made per order is revenue
        less consumables, commission, labour and delivery — fixed costs like rent aren&apos;t
        included.
      </p>

      <DrillDownDialog
        metric={open}
        week={week}
        hub={hub}
        onOpenChange={(o) => !o && setOpen(null)}
      />
    </div>
  );
}

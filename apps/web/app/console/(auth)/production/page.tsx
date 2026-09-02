"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseAsString, useQueryStates } from "nuqs";
import type { ColumnDef } from "@tanstack/react-table";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { GarmentStageBadge, GARMENT_STAGE_META } from "@/components/patterns/garment-stage-badge";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/icons/icon";
import {
  useBoardRecordQc,
  useBoardScan,
  useGarmentLines,
  useHubs,
  useMe,
  useWipSummary,
} from "@/lib/api/hooks";
import { canManageOrders } from "@/lib/permissions";
import { formatRelative } from "@/lib/format";
import type { GarmentLine, GarmentStage } from "@/lib/api/types";

// docs/01 §5.3: the exception branches (DAMAGED/LOST/HELD/RETURNED_UNPRESSED)
// stay visible on the board — ops needs to see them, only DELIVERED drops
// off since delivery is the actual finish line.
const PRODUCTION_STAGES: GarmentStage[] = [
  "RECEIVED",
  "SORTED",
  "PRESSING",
  "PRESSED",
  "QC",
  "REWORK",
  "PACKED",
  "DISPATCHED",
  "HELD",
  "RETURNED_UNPRESSED",
  "DAMAGED",
  "LOST",
];

export default function ProductionBoardPage() {
  const me = useMe();
  const canManage = canManageOrders(me.data?.roles);

  const [filters, setFilters] = useQueryStates({
    hub: parseAsString.withDefault(""),
    stage: parseAsString.withDefault(""),
    due: parseAsString.withDefault("all"),
  });

  const hubsQuery = useHubs();
  const hubs = hubsQuery.data?.results ?? [];

  const wipParams = useMemo(
    () => ({
      hub: filters.hub || undefined,
      due: filters.due === "all" ? undefined : (filters.due as "today" | "overdue"),
    }),
    [filters.hub, filters.due]
  );
  const wipQuery = useWipSummary(wipParams);

  const listParams = useMemo(
    () => ({
      hub: filters.hub || undefined,
      stage: (filters.stage || undefined) as GarmentStage | undefined,
      due: filters.due === "all" ? undefined : (filters.due as "today" | "overdue"),
      // Picking a specific stage is already precise — don't also hide it
      // if that stage happens to be a terminal one (e.g. inspecting
      // what's DELIVERED today).
      exclude_terminal: !filters.stage,
    }),
    [filters.hub, filters.stage, filters.due]
  );
  const linesQuery = useGarmentLines(listParams);

  const recordQc = useBoardRecordQc();

  const columns: ColumnDef<GarmentLine, unknown>[] = [
    {
      accessorKey: "order_ref",
      header: "Order",
      cell: ({ row }) => (
        <Link
          href={`/console/orders/${row.original.order}`}
          className="flex flex-col hover:underline"
        >
          <span className="font-medium text-text-primary">{row.original.order_ref}</span>
          <span className="font-mono text-xs text-text-muted">{row.original.bag_code}</span>
        </Link>
      ),
    },
    {
      accessorKey: "garment_type_name",
      header: "Garment",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Icon name="shirt" className="size-4 text-text-muted" />
          <span className="text-text-primary">
            #{row.original.seq} {row.original.garment_type_name}
          </span>
          {row.original.is_rework && (
            <Badge variant="danger" className="text-xs">
              Rework ×{row.original.rework_count}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "stage",
      header: "Stage",
      cell: ({ row }) => <GarmentStageBadge stage={row.original.stage} />,
    },
    {
      accessorKey: "stage_entered_at",
      header: "In this stage",
      cell: ({ row }) => (
        <span className="text-text-secondary">{formatRelative(row.original.stage_entered_at)}</span>
      ),
    },
    {
      accessorKey: "delivery_promised_at",
      header: "Due",
      cell: ({ row }) => <DueCell line={row.original} />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }: { row: { original: GarmentLine } }) =>
              row.original.stage === "QC" ? (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={recordQc.isPending}
                    onClick={() => recordQc.mutate({ id: row.original.id, result: "FAIL" })}
                  >
                    <Icon name="x-circle" className="text-status-danger" label="Fail QC" />
                  </Button>
                  <Button
                    size="sm"
                    loading={recordQc.isPending}
                    onClick={() => recordQc.mutate({ id: row.original.id, result: "PASS" })}
                  >
                    <Icon name="check-circle" label="Pass QC" />
                  </Button>
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Production board"
        description="Every garment currently moving through the hub, by stage."
      />

      <div className="flex flex-wrap items-end gap-3">
        {hubs.length > 1 && (
          <Select
            value={filters.hub || "all"}
            onValueChange={(v) => setFilters({ hub: v === "all" ? null : v })}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All hubs</SelectItem>
              {hubs.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Tabs value={filters.due} onValueChange={(v) => setFilters({ due: v })}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="today">Due today</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <WipTiles
        summary={wipQuery.data}
        loading={wipQuery.isPending}
        activeStage={filters.stage}
        onSelect={(stage) => setFilters({ stage: stage === filters.stage ? null : stage })}
      />

      {canManage && <BatchScanCard />}

      <AsyncBoundary
        query={linesQuery}
        loading={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        }
        isEmpty={(data) => data.results.length === 0}
        empty={
          <EmptyState
            icon="garment-bag"
            title="Nothing here"
            body={
              filters.stage || filters.due !== "all"
                ? "No garments match this filter right now."
                : "Nothing is currently in production."
            }
          />
        }
      >
        {(data) => (
          <DataTable
            data={data.results}
            columns={columns}
            getRowId={(row) => row.id}
            mobileCard={(row) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{row.order_ref}</p>
                    <p className="text-xs text-text-muted">
                      #{row.seq} {row.garment_type_name}
                    </p>
                  </div>
                  <GarmentStageBadge stage={row.stage} />
                </div>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>{formatRelative(row.stage_entered_at)}</span>
                  <DueCell line={row} />
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

function DueCell({ line }: { line: GarmentLine }) {
  if (!line.delivery_promised_at) return <span className="text-text-muted">—</span>;
  const promised = new Date(line.delivery_promised_at);
  const overdue = promised.getTime() < Date.now();
  const isToday = promised.toDateString() === new Date().toDateString();
  if (overdue) {
    return (
      <Badge variant="danger">
        <Icon name="alert-triangle" className="size-3" /> Overdue
      </Badge>
    );
  }
  if (isToday) return <Badge variant="warning">Today</Badge>;
  return <span className="text-text-muted">{formatRelative(line.delivery_promised_at)}</span>;
}

function WipTiles({
  summary,
  loading,
  activeStage,
  onSelect,
}: {
  summary: Partial<Record<GarmentStage, number>> | undefined;
  loading: boolean;
  activeStage: string;
  onSelect: (stage: string) => void;
}) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {PRODUCTION_STAGES.map((stage) => {
        const meta = GARMENT_STAGE_META[stage];
        const active = activeStage === stage;
        return (
          <button
            key={stage}
            type="button"
            onClick={() => onSelect(stage)}
            className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
              active
                ? "border-brand-yellow bg-brand-yellow/10"
                : "border-border-default bg-surface-raised hover:bg-surface-sunken"
            }`}
          >
            <span className="text-2xl font-semibold text-text-primary tabular-nums">
              {summary[stage] ?? 0}
            </span>
            <span className="text-xs font-medium text-text-secondary">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function BatchScanCard() {
  const [queue, setQueue] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [toStage, setToStage] = useState<GarmentStage>("SORTED");
  const scan = useBoardScan();
  const [submitting, setSubmitting] = useState(false);

  function addToQueue() {
    const trimmed = code.trim();
    if (!trimmed || queue.includes(trimmed)) {
      setCode("");
      return;
    }
    setQueue((q) => [...q, trimmed]);
    setCode("");
  }

  async function processQueue() {
    setSubmitting(true);
    const remaining: string[] = [];
    for (const bagCode of queue) {
      try {
        await scan.mutateAsync({ code: bagCode, to_stage: toStage });
      } catch {
        remaining.push(bagCode); // failed scans stay queued, not silently dropped
      }
    }
    setQueue(remaining);
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface-raised p-4">
      <div className="flex items-center gap-2">
        <Icon name="scan-tag" className="size-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Batch scan</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Scan or type a bag code…"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addToQueue();
            }
          }}
          className="w-56"
        />
        <span className="text-xs text-text-muted">to</span>
        <Select value={toStage} onValueChange={(v) => setToStage(v as GarmentStage)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(GARMENT_STAGE_META).map(([stage, meta]) => (
              <SelectItem key={stage} value={stage}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={addToQueue} disabled={!code.trim()}>
          <Icon name="plus" /> Add
        </Button>
        {queue.length > 0 && (
          <Button size="sm" loading={submitting} onClick={processQueue}>
            Scan {queue.length} to {GARMENT_STAGE_META[toStage].label.toLowerCase()}
          </Button>
        )}
      </div>
      {queue.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {queue.map((c) => (
            <Badge key={c} variant="neutral" className="font-mono">
              {c}
              <button
                type="button"
                onClick={() => setQueue((q) => q.filter((x) => x !== c))}
                aria-label={`Remove ${c} from the queue`}
                className="ml-1"
              >
                <Icon name="close" className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

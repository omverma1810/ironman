"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { JobStatusBadge } from "@/components/patterns/job-status-badge";
import {
  useAssignRouteDay,
  useFailJob,
  useFieldStaff,
  useOrders,
  useRouteDay,
  useStartJob,
} from "@/lib/api/hooks";
import { formatDateTime } from "@/lib/format";
import type { Job, JobKind } from "@/lib/api/types";

const KIND_ORDER_STATUS: Record<JobKind, string> = { PICKUP: "SCHEDULED", DELIVERY: "READY" };

/** Ops-side route-day planning and job board (docs/08 batch 2.7). Deliberately
 * not the Field PWA (docs/08 batch 2.11/2.12) — that's a separate, larger,
 * offline-first surface for the rider's own phone; this is where ops plans
 * the day and watches it happen. */
export function RouteDayBoard({ routeDayId }: { routeDayId: string }) {
  const routeDayQuery = useRouteDay(routeDayId);

  return (
    <AsyncBoundary
      query={routeDayQuery}
      loading={
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      }
    >
      {(routeDay) => (
        <div className="flex flex-col gap-6">
          <AssignJobsPanel routeDayId={routeDayId} hub={routeDay.hub} />

          {routeDay.jobs.length === 0 ? (
            <EmptyState
              icon="truck"
              title="No jobs assigned yet"
              body="Assign a pickup or delivery above to get this route day started."
            />
          ) : (
            <JobsTable jobs={routeDay.jobs} routeDayId={routeDayId} />
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}

function JobsTable({ jobs, routeDayId }: { jobs: Job[]; routeDayId: string }) {
  const router = useRouter();

  const columns: ColumnDef<Job, unknown>[] = [
    {
      accessorKey: "order_ref",
      header: "Order",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium text-text-primary underline-offset-2 hover:underline"
          onClick={() => router.push(`/console/orders/${row.original.order}`)}
        >
          {row.original.order_ref}
        </button>
      ),
    },
    {
      accessorKey: "kind",
      header: "Kind",
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.kind === "PICKUP" ? "Pickup" : "Delivery"}</Badge>
      ),
    },
    {
      accessorKey: "assigned_to_name",
      header: "Assigned to",
      cell: ({ row }) => (
        <span className="text-text-secondary">{row.original.assigned_to_name || "Unassigned"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <JobStatusBadge status={row.original.status} />
          {row.original.completed_at && (
            <span className="text-xs text-text-muted">
              {formatDateTime(row.original.completed_at)}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "attempt_no",
      header: "Attempt",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">#{row.original.attempt_no}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <JobActions job={row.original} routeDayId={routeDayId} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={jobs}
      columns={columns}
      getRowId={(job) => job.id}
      mobileCard={(job) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="font-medium text-text-primary underline-offset-2 hover:underline"
              onClick={() => router.push(`/console/orders/${job.order}`)}
            >
              {job.order_ref}
            </button>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Badge variant="outline">{job.kind === "PICKUP" ? "Pickup" : "Delivery"}</Badge>
            <span>{job.assigned_to_name || "Unassigned"}</span>
            <span>· attempt #{job.attempt_no}</span>
          </div>
          <JobActions job={job} routeDayId={routeDayId} />
        </div>
      )}
    />
  );
}

function JobActions({ job, routeDayId }: { job: Job; routeDayId: string }) {
  const startMutation = useStartJob(routeDayId);
  const failMutation = useFailJob(routeDayId);
  const canAct = job.status === "PENDING" || job.status === "EN_ROUTE" || job.status === "ARRIVED";

  if (!canAct) return null;

  return (
    <div className="flex gap-2">
      {job.status === "PENDING" && (
        <Button
          size="sm"
          variant="outline"
          loading={startMutation.isPending}
          onClick={() => startMutation.mutate(job.id)}
        >
          Start
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-status-danger hover:bg-status-danger-bg"
        loading={failMutation.isPending}
        onClick={() => failMutation.mutate({ jobId: job.id, reason_code: "ops_marked_failed" })}
      >
        Mark failed
      </Button>
    </div>
  );
}

function AssignJobsPanel({ routeDayId, hub }: { routeDayId: string; hub: string }) {
  const [kind, setKind] = useState<JobKind>("PICKUP");
  const [orderId, setOrderId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");

  const ordersQuery = useOrders({ status: KIND_ORDER_STATUS[kind], hub });
  const staffQuery = useFieldStaff();
  const assignMutation = useAssignRouteDay(routeDayId);

  const candidates = ordersQuery.data?.results ?? [];
  const staff = staffQuery.data ?? [];

  function handleAssign() {
    if (!orderId || !staffId) return;
    assignMutation.mutate(
      {
        staff: [staffId],
        jobs: [{ order_id: orderId, kind, assigned_to: staffId }],
      },
      { onSuccess: () => setOrderId("") }
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-default bg-surface-raised p-4">
      <div className="flex flex-col gap-1.5">
        <Label>Job type</Label>
        <Select value={kind} onValueChange={(v) => { setKind(v as JobKind); setOrderId(""); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PICKUP">Pickup</SelectItem>
            <SelectItem value="DELIVERY">Delivery</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Order</Label>
        <Select value={orderId} onValueChange={setOrderId}>
          <SelectTrigger className="w-64">
            <SelectValue
              placeholder={
                candidates.length === 0
                  ? kind === "PICKUP"
                    ? "No orders awaiting pickup"
                    : "No orders awaiting delivery"
                  : "Choose an order"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((order) => (
              <SelectItem key={order.id} value={order.id}>
                {order.ref} — {order.customer_name} ({order.apartment_name || "no apartment"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Assign to</Label>
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={staff.length === 0 ? "No field staff" : "Choose a rider"} />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name || s.email || s.phone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleAssign}
        disabled={!orderId || !staffId}
        loading={assignMutation.isPending}
      >
        Assign
      </Button>
    </div>
  );
}

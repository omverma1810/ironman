"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/empty-state";
import { Icon } from "@/components/icons/icon";
import { useMyJobs } from "@/lib/api/hooks";
import { addDaysIso, formatTime, todayIsoIST } from "@/lib/format";
import type { Job, JobStatus } from "@/lib/api/types";

const STATUS_BADGE: Record<JobStatus, { label: string; variant: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Not started", variant: "neutral" },
  EN_ROUTE: { label: "En route", variant: "info" },
  ARRIVED: { label: "Arrived", variant: "warning" },
  DONE: { label: "Done", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
};

function dayLabel(iso: string): string {
  const today = todayIsoIST();
  if (iso === today) return "Today";
  if (iso === addDaysIso(today, -1)) return "Yesterday";
  if (iso === addDaysIso(today, 1)) return "Tomorrow";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

export default function FieldJobsPage() {
  const [date, setDate] = useState(todayIsoIST);
  const jobsQuery = useMyJobs(date);

  const jobs = useMemo(
    () => [...(jobsQuery.data ?? [])].sort((a, b) => a.sequence - b.sequence),
    [jobsQuery.data]
  );
  const pendingJobs = jobs.filter((j) => j.status !== "DONE" && j.status !== "FAILED");
  const doneJobs = jobs.filter((j) => j.status === "DONE" || j.status === "FAILED");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDate((d) => addDaysIso(d, -1))}
          aria-label="Previous day"
        >
          <Icon name="arrow-left" />
        </Button>
        <p className="font-display text-base font-bold text-text-primary">{dayLabel(date)}</p>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDate((d) => addDaysIso(d, 1))}
          aria-label="Next day"
        >
          <Icon name="arrow-right" />
        </Button>
      </div>

      {jobsQuery.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : jobsQuery.isError ? (
        <EmptyState
          icon="alert-triangle"
          title="Couldn't load your jobs"
          body="Check your connection and try again."
          action={
            <Button size="sm" onClick={() => jobsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="truck"
          title="No jobs for this day"
          body="Nothing assigned to you on this route day."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pendingJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {doneJobs.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
                Completed
              </p>
              {doneJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const status = STATUS_BADGE[job.status];
  const isDone = job.status === "DONE" || job.status === "FAILED";
  return (
    <Link
      href={`/field/jobs/${job.id}`}
      className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-4 shadow-xs active:bg-surface-sunken"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
        <Icon name={job.kind === "PICKUP" ? "package-open" : "garment-bag"} className="size-5 text-text-secondary" />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${isDone ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{job.kind === "PICKUP" ? "Pickup" : "Delivery"}</span>
          <span className="truncate text-sm text-text-muted">{job.order_ref}</span>
        </div>
        <span className="text-xs text-text-secondary">
          {job.slot_start ? formatTime(job.slot_start) : "No slot"}
          {job.slot_end ? ` – ${formatTime(job.slot_end)}` : ""}
        </span>
      </div>
      <Badge variant={status.variant}>{status.label}</Badge>
      <Icon name="chevron-right" className="size-4 text-text-muted" />
    </Link>
  );
}

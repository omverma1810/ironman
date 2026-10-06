/**
 * What a rider may do to a job, and what a job looks like once the actions
 * still waiting to sync are counted. The transitions mirror the server's
 * (`fulfilment/state_machine.py`): the server is the authority, but the app
 * must not offer, or queue, what it will certainly refuse.
 */
import type { JobCard, JobStatus, OpType, QueuedOp } from "../types";

const ALLOWED: Record<JobStatus, Partial<Record<OpType, JobStatus>>> = {
  PENDING: { "job.start": "EN_ROUTE", "job.fail": "FAILED" },
  EN_ROUTE: { "job.arrive": "ARRIVED", "job.complete": "DONE", "job.fail": "FAILED" },
  ARRIVED: { "job.complete": "DONE", "job.fail": "FAILED" },
  DONE: {},
  FAILED: {},
};

export function nextStatus(status: JobStatus, op: OpType): JobStatus | null {
  return ALLOWED[status][op] ?? null;
}

export function isFinished(status: JobStatus): boolean {
  return status === "DONE" || status === "FAILED";
}

/**
 * The job as the rider should see it: the last fetched copy with their
 * unsent actions applied in order. An action that no longer fits (the server
 * copy is already past it, e.g. a reply was lost and the cache was refreshed)
 * is skipped here and settled by the server when the queue is sent.
 */
export function effectiveJobs(jobs: JobCard[], ops: QueuedOp[]): JobCard[] {
  const byJob = new Map<string, QueuedOp[]>();
  for (const op of ops) {
    byJob.set(op.job_id, [...(byJob.get(op.job_id) ?? []), op]);
  }
  return jobs.map((job) => {
    let status = job.status;
    for (const op of byJob.get(job.id) ?? []) {
      const next = nextStatus(status, op.op_type);
      if (next) status = next;
    }
    return status === job.status ? job : { ...job, status };
  });
}

/** Today's stops in the order to drive them: by sequence, then pickup window. */
export function sortJobs(jobs: JobCard[]): JobCard[] {
  return [...jobs].sort(
    (a, b) =>
      a.sequence - b.sequence ||
      (a.slot_start ?? "").localeCompare(b.slot_start ?? "") ||
      a.order_ref.localeCompare(b.order_ref)
  );
}

/** Today in India, as YYYY-MM-DD, whatever timezone the phone is set to. */
export function todayInIndia(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Splits the cached jobs into what to do now and what is done. Earlier days
 * still carrying unfinished work stay in "to do" (a job missed yesterday is
 * still the rider's job today); finished jobs from other days are dropped.
 */
export function splitDay(jobs: JobCard[], today: string): { todo: JobCard[]; done: JobCard[] } {
  const relevant = jobs.filter((j) => j.date <= today && (j.date === today || !isFinished(j.status)));
  const sorted = sortJobs(relevant);
  return {
    todo: sorted.filter((j) => !isFinished(j.status)),
    done: sorted.filter((j) => isFinished(j.status)),
  };
}

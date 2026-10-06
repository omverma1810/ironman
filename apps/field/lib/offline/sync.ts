/**
 * Sending what the rider did while offline. The rules, in order of how much
 * they matter (docs/08 risk R8):
 *
 *  1. Nothing leaves the queue until the server has answered for it. A dropped
 *     connection, a 5xx or a timeout leaves every action exactly where it was.
 *  2. Every action carries a `client_op_id`, so sending the same queue twice
 *     (a lost reply) applies each action once. The server remembers.
 *  3. The server decides. An action it will not take (the job was reassigned,
 *     or already closed by ops) is not retried and not hidden: it is kept as
 *     an issue until the rider has read it.
 *  4. One bad action never blocks the ones behind it.
 */
import { ApiError } from "@ironman/api-client";
import type {
  JobCard,
  OfflineOpResult,
  OpType,
  QueuedOp,
  QueuedProof,
  SyncIssue,
} from "../types";
import { nextStatus } from "./rules";
import type { FieldStore } from "./store";

export type SyncDeps = {
  store: FieldStore;
  post: (path: string, body: unknown) => Promise<unknown>;
  fetchJobs: () => Promise<JobCard[]>;
  uploadProof: (proof: QueuedProof) => Promise<void>;
  /** Delete the local photo once it is safely on the server (or refused for good). */
  discardFile: (uri: string) => Promise<void>;
  newId: () => string;
  now: () => Date;
};

export type SyncSummary = {
  applied: number;
  issues: SyncIssue[];
  uploadedProofs: number;
  /** Still waiting: the connection or the server wasn't there. */
  remainingOps: number;
  remainingProofs: number;
  /** True when this run ended on a network or server failure. */
  offline: boolean;
  jobsRefreshed: boolean;
};

const BATCH = 50;

const WHAT: Record<OpType, string> = {
  "job.start": "Starting the job",
  "job.arrive": "Marking arrival",
  "job.complete": "Completing the job",
  "job.fail": "Reporting a problem",
};

/** A refusal that will never change on retry, as opposed to "try again later". */
function isFinalRefusal(error: unknown): boolean {
  return (
    ApiError.isApiError(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export async function flush(deps: SyncDeps): Promise<SyncSummary> {
  const { store } = deps;
  const summary: SyncSummary = {
    applied: 0,
    issues: [],
    uploadedProofs: 0,
    remainingOps: 0,
    remainingProofs: 0,
    offline: false,
    jobsRefreshed: false,
  };

  const cache = await store.loadJobs();
  const refOf = (jobId: string) => cache.jobs.find((j) => j.id === jobId)?.order_ref ?? "a job";
  const issue = (op: { job_id: string }, what: string, message: string): SyncIssue => ({
    id: deps.newId(),
    job_id: op.job_id,
    order_ref: refOf(op.job_id),
    what,
    message,
    at: deps.now().toISOString(),
  });

  // ── 1. actions ────────────────────────────────────────────────────────
  const ops = await store.loadOps();
  const deviceId = ops.length ? await store.deviceId() : "";
  for (let start = 0; start < ops.length && !summary.offline; start += BATCH) {
    const batch = ops.slice(start, start + BATCH);
    const settled = await sendBatch(deps, deviceId, batch, summary, issue);
    if (settled === "offline") summary.offline = true;
  }

  // ── 2. photos ─────────────────────────────────────────────────────────
  if (!summary.offline) {
    for (const proof of await store.loadProofs()) {
      try {
        await deps.uploadProof(proof);
        await store.removeProof(proof.id);
        await deps.discardFile(proof.uri);
        summary.uploadedProofs += 1;
      } catch (error) {
        if (isFinalRefusal(error)) {
          const found = issue(
            proof,
            "Uploading a photo",
            ApiError.isApiError(error) ? error.message : "The photo was refused."
          );
          summary.issues.push(found);
          await store.addIssues([found]);
          await store.removeProof(proof.id);
          await deps.discardFile(proof.uri);
        } else {
          summary.offline = true;
          break;
        }
      }
    }
  }

  // ── 3. the day, as the server now has it ──────────────────────────────
  if (!summary.offline) {
    try {
      await store.saveJobs(await deps.fetchJobs(), deps.now().toISOString());
      summary.jobsRefreshed = true;
    } catch {
      summary.offline = true;
    }
  }

  summary.remainingOps = (await store.loadOps()).length;
  summary.remainingProofs = (await store.loadProofs()).length;
  return summary;
}

async function sendBatch(
  deps: SyncDeps,
  deviceId: string,
  batch: QueuedOp[],
  summary: SyncSummary,
  issue: (op: { job_id: string }, what: string, message: string) => SyncIssue
): Promise<"done" | "offline"> {
  const { store } = deps;
  let results: OfflineOpResult[];
  try {
    results = (await deps.post("/fulfilment/sync", {
      device_id: deviceId,
      ops: batch.map((op) => ({
        client_op_id: op.client_op_id,
        op_type: op.op_type,
        payload: { job_id: op.job_id, ...op.payload },
        client_ts: op.client_ts,
      })),
    })) as OfflineOpResult[];
  } catch (error) {
    if (isFinalRefusal(error) && batch.length > 1) {
      // One malformed action must not hold up the rest: send them singly.
      for (const op of batch) {
        if ((await sendBatch(deps, deviceId, [op], summary, issue)) === "offline") return "offline";
      }
      return "done";
    }
    if (isFinalRefusal(error)) {
      const found = issue(batch[0], WHAT[batch[0].op_type], (error as ApiError).message);
      summary.issues.push(found);
      await store.addIssues([found]);
      await store.removeOps([batch[0].client_op_id]);
      return "done";
    }
    return "offline";
  }

  const byId = new Map(results.map((r) => [r.client_op_id, r]));
  const settled: string[] = [];
  const found: SyncIssue[] = [];
  for (const op of batch) {
    const result = byId.get(op.client_op_id);
    if (!result) continue; // no answer for it: leave it queued
    settled.push(op.client_op_id);
    if (result.status === "APPLIED") {
      summary.applied += 1;
      // The cached job moves with the server, before the action leaves the
      // queue: at no instant does the phone hold a job without the action
      // that changed it, so an action tapped mid-send is judged against the
      // true state and never dropped.
      const current = (await store.loadJobs()).jobs.find((j) => j.id === op.job_id);
      const moved = current && nextStatus(current.status, op.op_type);
      if (moved) await store.patchJob(op.job_id, moved);
    } else {
      found.push(
        issue(
          op,
          WHAT[op.op_type],
          result.result_detail || "The server did not accept this action."
        )
      );
    }
  }
  // Issues are written before the actions leave the queue: if the app dies
  // between the two, the rider sees an issue twice rather than never.
  if (found.length) {
    await store.addIssues(found);
    summary.issues.push(...found);
  }
  await store.removeOps(settled);
  return "done";
}

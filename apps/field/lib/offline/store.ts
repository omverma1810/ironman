/**
 * Everything the field app keeps on the phone so it can work without signal:
 * the day's jobs, the actions the rider took, photos waiting to upload, and
 * anything the server refused. Held per rider, so a phone passed to someone
 * else never replays the first rider's actions under the second's name.
 *
 * Nothing here ever leaves the queue until the server has answered for it.
 */
import type { KeyValue } from "../kv";
import type { JobCard, JobStatus, QueuedOp, QueuedProof, SyncIssue } from "../types";

export type JobsCache = { jobs: JobCard[]; fetchedAt: string | null };

export type FieldStore = {
  loadJobs: () => Promise<JobsCache>;
  saveJobs: (jobs: JobCard[], fetchedAt: string) => Promise<void>;
  /** Records that the server took an action: the cached job moves with it. */
  patchJob: (jobId: string, status: JobStatus) => Promise<void>;
  loadOps: () => Promise<QueuedOp[]>;
  addOp: (op: QueuedOp) => Promise<void>;
  removeOps: (ids: string[]) => Promise<void>;
  loadProofs: () => Promise<QueuedProof[]>;
  addProof: (proof: QueuedProof) => Promise<void>;
  removeProof: (id: string) => Promise<void>;
  loadIssues: () => Promise<SyncIssue[]>;
  addIssues: (issues: SyncIssue[]) => Promise<void>;
  dismissIssue: (id: string) => Promise<void>;
  deviceId: () => Promise<string>;
};

export function createFieldStore(
  kv: KeyValue,
  userId: string,
  newId: () => string
): FieldStore {
  const key = (name: string) => `ironman.field.${userId}.${name}`;
  // Reads and writes of one list are serialised: two taps a moment apart must
  // both land, not overwrite each other with a stale copy.
  let chain: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work);
    chain = run.catch(() => undefined);
    return run;
  }
  function update<T>(name: string, fallback: T, change: (current: T) => T): Promise<void> {
    return exclusive(async () => {
      const current = await kv.get<T>(key(name), fallback);
      await kv.set(key(name), change(current));
    });
  }

  return {
    loadJobs: () => exclusive(() => kv.get<JobsCache>(key("jobs"), { jobs: [], fetchedAt: null })),
    saveJobs: (jobs, fetchedAt) => exclusive(() => kv.set(key("jobs"), { jobs, fetchedAt })),

    patchJob: (jobId, status) =>
      update<JobsCache>("jobs", { jobs: [], fetchedAt: null }, (cache) => ({
        ...cache,
        jobs: cache.jobs.map((j) => (j.id === jobId ? { ...j, status } : j)),
      })),

    loadOps: () => exclusive(() => kv.get<QueuedOp[]>(key("ops"), [])),
    addOp: (op) => update<QueuedOp[]>("ops", [], (ops) => [...ops, op]),
    removeOps: (ids) =>
      update<QueuedOp[]>("ops", [], (ops) => ops.filter((o) => !ids.includes(o.client_op_id))),

    loadProofs: () => exclusive(() => kv.get<QueuedProof[]>(key("proofs"), [])),
    addProof: (proof) => update<QueuedProof[]>("proofs", [], (all) => [...all, proof]),
    removeProof: (id) =>
      update<QueuedProof[]>("proofs", [], (all) => all.filter((p) => p.id !== id)),

    loadIssues: () => exclusive(() => kv.get<SyncIssue[]>(key("issues"), [])),
    addIssues: (issues) => update<SyncIssue[]>("issues", [], (all) => [...all, ...issues]),
    dismissIssue: (id) =>
      update<SyncIssue[]>("issues", [], (all) => all.filter((i) => i.id !== id)),

    // The phone's id as the server knows it; survives sign-outs and riders.
    deviceId: () =>
      exclusive(async () => {
        const existing = await kv.get<string | null>("ironman.field.deviceId", null);
        if (existing) return existing;
        const created = newId();
        await kv.set("ironman.field.deviceId", created);
        return created;
      }),
  };
}

/**
 * The field app's offline-first core as React state. The screens read the day
 * from here and never from the network: the phone's copy is the truth the rider
 * works against, and the server catches up when it can.
 *
 * A rider's action is written to the queue first (durably), shown at once, and
 * sent in the background. The queue is sent when the app opens or returns to
 * the foreground, after each action, every minute while there is something
 * waiting, and when the rider asks.
 */
import * as Crypto from "expo-crypto";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { api } from "../api";
import { kv } from "../kv";
import { discardPhoto, keepPhoto, uploadProof } from "../proofs";
import type { DeclaredLine, JobCard, OpType, QueuedOp, QueuedProof, SyncIssue } from "../types";
import { effectiveJobs, nextStatus } from "./rules";
import { createFieldStore, type FieldStore } from "./store";
import { flush, type SyncSummary } from "./sync";

type Completion = {
  declared_lines?: DeclaredLine[];
  bag_codes?: string[];
  /** Photos already captured for this job (see `addPhoto`). */
};

export type FieldState = {
  ready: boolean;
  jobs: JobCard[];
  fetchedAt: string | null;
  pendingOps: number;
  pendingPhotos: number;
  issues: SyncIssue[];
  syncing: boolean;
  /** The last attempt could not reach the server. */
  offline: boolean;
  syncNow: () => Promise<SyncSummary | null>;
  start: (job: JobCard) => Promise<void>;
  arrive: (job: JobCard) => Promise<void>;
  complete: (job: JobCard, completion: Completion) => Promise<void>;
  fail: (job: JobCard, reason_code: string, note: string) => Promise<void>;
  addPhoto: (job: JobCard, capturedUri: string) => Promise<void>;
  dismissIssue: (id: string) => Promise<void>;
};

const FieldContext = createContext<FieldState | null>(null);

const SYNC_EVERY_MS = 60_000;

export function FieldProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const store: FieldStore = useMemo(
    () => createFieldStore(kv, userId, () => Crypto.randomUUID()),
    [userId]
  );
  const [ready, setReady] = useState(false);
  const [cached, setCached] = useState<JobCard[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [proofs, setProofs] = useState<QueuedProof[]>([]);
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const running = useRef<Promise<SyncSummary | null> | null>(null);
  const again = useRef(false);

  const reload = useCallback(async () => {
    const [cache, queued, photos, found] = await Promise.all([
      store.loadJobs(),
      store.loadOps(),
      store.loadProofs(),
      store.loadIssues(),
    ]);
    setCached(cache.jobs);
    setFetchedAt(cache.fetchedAt);
    setOps(queued);
    setProofs(photos);
    setIssues(found);
  }, [store]);

  const syncNow = useCallback((): Promise<SyncSummary | null> => {
    // One run at a time; a request that arrives mid-run asks for one more
    // pass afterwards, so an action taken while sending is not left waiting.
    if (running.current) {
      again.current = true;
      return running.current;
    }
    setSyncing(true);
    const run = (async () => {
      let summary: SyncSummary | null = null;
      try {
        do {
          again.current = false;
          summary = await flush({
            store,
            post: (path, body) => api.post(path, body),
            fetchJobs: () => api.get<JobCard[]>("/fulfilment/jobs/mine/"),
            uploadProof,
            discardFile: discardPhoto,
            newId: () => Crypto.randomUUID(),
            now: () => new Date(),
          });
          setOffline(summary.offline);
          await reload();
        } while (again.current && !summary.offline);
      } catch {
        // The session ended mid-run or storage failed: nothing was lost, the
        // queue is as it was.
        setOffline(true);
      } finally {
        running.current = null;
        setSyncing(false);
      }
      return summary;
    })();
    running.current = run;
    return run;
  }, [store, reload]);

  // Load what is on the phone first so the day shows at once, even with no
  // signal; then try the network.
  useEffect(() => {
    let alive = true;
    (async () => {
      await reload();
      if (!alive) return;
      setReady(true);
      void syncNow();
    })();
    return () => {
      alive = false;
    };
  }, [reload, syncNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void syncNow();
    }, SYNC_EVERY_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [syncNow]);

  const jobs = useMemo(() => effectiveJobs(cached, ops), [cached, ops]);

  const enqueue = useCallback(
    async (job: JobCard, op_type: OpType, payload: Record<string, unknown> = {}) => {
      // Judged against the job as the rider sees it: the cached copy with
      // every queued action applied, read fresh so two quick taps agree.
      const [cache, queued] = await Promise.all([store.loadJobs(), store.loadOps()]);
      const raw = cache.jobs.find((j) => j.id === job.id) ?? job;
      const current = effectiveJobs([raw], queued)[0];
      if (!nextStatus(current.status, op_type)) return;
      await store.addOp({
        client_op_id: Crypto.randomUUID(),
        op_type,
        job_id: job.id,
        payload,
        client_ts: new Date().toISOString(),
      });
      await reload();
      void syncNow();
    },
    [store, reload, syncNow]
  );

  const value: FieldState = {
    ready,
    jobs,
    fetchedAt,
    pendingOps: ops.length,
    pendingPhotos: proofs.length,
    issues,
    syncing,
    offline,
    syncNow,
    start: (job) => enqueue(job, "job.start"),
    arrive: (job) => enqueue(job, "job.arrive"),
    complete: (job, completion) =>
      enqueue(job, "job.complete", {
        declared_lines: completion.declared_lines ?? [],
        bag_codes: completion.bag_codes ?? [],
      }),
    fail: (job, reason_code, note) => enqueue(job, "job.fail", { reason_code, note }),
    addPhoto: async (job, capturedUri) => {
      const id = Crypto.randomUUID();
      await store.addProof({
        id,
        job_id: job.id,
        uri: keepPhoto(capturedUri, id),
        captured_at: new Date().toISOString(),
      });
      await reload();
      void syncNow();
    },
    dismissIssue: async (id) => {
      await store.dismissIssue(id);
      await reload();
    },
  };

  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>;
}

export function useField(): FieldState {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error("useField must be used within a FieldProvider");
  return ctx;
}

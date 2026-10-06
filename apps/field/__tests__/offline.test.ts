import { ApiError } from "@ironman/api-client";
import type { KeyValue } from "../lib/kv";
import { effectiveJobs, nextStatus, splitDay, todayInIndia } from "../lib/offline/rules";
import { createFieldStore } from "../lib/offline/store";
import { flush, type SyncDeps } from "../lib/offline/sync";
import type { JobCard, OfflineOpResult, QueuedOp, QueuedProof } from "../lib/types";

function memoryKv(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key, fallback) {
      const raw = data.get(key);
      return raw === undefined ? fallback : JSON.parse(raw);
    },
    async set(key, value) {
      // A write takes a moment, like real storage: this is what makes a lost
      // update visible if two writers are not serialised.
      await new Promise((r) => setTimeout(r, 1));
      data.set(key, JSON.stringify(value));
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

function job(over: Partial<JobCard> = {}): JobCard {
  return {
    id: "job-1",
    route_day: "rd-1",
    date: "2026-10-07",
    order: "order-1",
    order_ref: "ORD-0001",
    order_status: "PICKUP_ASSIGNED",
    payment_status: "UNPAID",
    kind: "PICKUP",
    sequence: 0,
    status: "PENDING",
    slot_start: null,
    slot_end: null,
    attempt_no: 1,
    customer_name: "Asha",
    customer_phone: "+919000000001",
    apartment_name: "Lake View",
    address: "Flat 4B, Lake View",
    special_instructions: "",
    lines: [],
    bag_count: 0,
    ...over,
  };
}

function op(id: string, op_type: QueuedOp["op_type"], job_id = "job-1"): QueuedOp {
  return { client_op_id: id, op_type, job_id, payload: {}, client_ts: "2026-10-07T04:00:00Z" };
}

function apiError(status: number, message = "no"): ApiError {
  return new ApiError(status, {
    error: {
      code: "x",
      message,
      detail: null,
      field_errors: {},
      request_id: "",
      retryable: status >= 500,
    },
  });
}

describe("what a rider may do", () => {
  it("follows the server's job transitions", () => {
    expect(nextStatus("PENDING", "job.start")).toBe("EN_ROUTE");
    expect(nextStatus("EN_ROUTE", "job.arrive")).toBe("ARRIVED");
    expect(nextStatus("EN_ROUTE", "job.complete")).toBe("DONE");
    expect(nextStatus("ARRIVED", "job.complete")).toBe("DONE");
    expect(nextStatus("PENDING", "job.complete")).toBeNull();
    expect(nextStatus("DONE", "job.fail")).toBeNull();
    expect(nextStatus("FAILED", "job.start")).toBeNull();
  });

  it("shows the job with unsent actions applied, in order", () => {
    const [shown] = effectiveJobs(
      [job()],
      [op("a", "job.start"), op("b", "job.arrive"), op("c", "job.complete")]
    );
    expect(shown.status).toBe("DONE");
  });

  it("skips an unsent action the server copy is already past", () => {
    // The reply to "start" was lost, the cache was refreshed, the queue still has it.
    const [shown] = effectiveJobs([job({ status: "ARRIVED" })], [op("a", "job.start")]);
    expect(shown.status).toBe("ARRIVED");
  });

  it("leaves other jobs alone", () => {
    const [a, b] = effectiveJobs([job(), job({ id: "job-2" })], [op("a", "job.start")]);
    expect(a.status).toBe("EN_ROUTE");
    expect(b.status).toBe("PENDING");
  });
});

describe("the day list", () => {
  it("is today in India whatever the phone's clock says", () => {
    // 21:00 UTC on the 6th is already the 7th in India.
    expect(todayInIndia(new Date("2026-10-06T21:00:00Z"))).toBe("2026-10-07");
    expect(todayInIndia(new Date("2026-10-07T05:00:00Z"))).toBe("2026-10-07");
  });

  it("keeps yesterday's unfinished work and drops yesterday's finished work", () => {
    const { todo, done } = splitDay(
      [
        job({ id: "old-open", date: "2026-10-06", status: "PENDING" }),
        job({ id: "old-done", date: "2026-10-06", status: "DONE" }),
        job({ id: "today-done", status: "DONE" }),
        job({ id: "today-open", sequence: 1 }),
        job({ id: "tomorrow", date: "2026-10-08" }),
      ],
      "2026-10-07"
    );
    expect(todo.map((j) => j.id)).toEqual(["old-open", "today-open"]);
    expect(done.map((j) => j.id)).toEqual(["today-done"]);
  });
});

describe("the phone's store", () => {
  it("keeps both of two quick writes", async () => {
    const store = createFieldStore(memoryKv(), "rider-1", () => "id");
    await Promise.all([store.addOp(op("a", "job.start")), store.addOp(op("b", "job.arrive"))]);
    expect((await store.loadOps()).map((o) => o.client_op_id)).toEqual(["a", "b"]);
  });

  it("keeps each rider's queue apart", async () => {
    const kv = memoryKv();
    const one = createFieldStore(kv, "rider-1", () => "id");
    const two = createFieldStore(kv, "rider-2", () => "id");
    await one.addOp(op("a", "job.start"));
    expect(await two.loadOps()).toEqual([]);
    expect(await one.loadOps()).toHaveLength(1);
  });

  it("remembers the phone's id", async () => {
    const kv = memoryKv();
    let n = 0;
    const store = createFieldStore(kv, "rider-1", () => `device-${++n}`);
    expect(await store.deviceId()).toBe("device-1");
    expect(await store.deviceId()).toBe("device-1");
    expect(await createFieldStore(kv, "rider-2", () => `device-${++n}`).deviceId()).toBe(
      "device-1"
    );
  });
});

describe("sending the queue", () => {
  function setup(over: Partial<SyncDeps> = {}) {
    const kv = memoryKv();
    const store = createFieldStore(kv, "rider-1", () => "dev");
    let n = 0;
    const discarded: string[] = [];
    const deps: SyncDeps = {
      store,
      post: async () => [],
      fetchJobs: async () => [job({ status: "DONE" })],
      uploadProof: async () => undefined,
      discardFile: async (uri) => {
        discarded.push(uri);
      },
      newId: () => `id-${++n}`,
      now: () => new Date("2026-10-07T05:00:00Z"),
      ...over,
    };
    return { store, deps, discarded };
  }

  const ok = (ops: QueuedOp[], status: OfflineOpResult["status"] = "APPLIED", detail = "") =>
    ops.map((o) => ({ client_op_id: o.client_op_id, op_type: o.op_type, status, result_detail: detail }));

  it("sends actions in the order they were taken and empties the queue", async () => {
    const sent: string[] = [];
    const { store, deps } = setup({
      post: async (_path, body) => {
        const ops = (body as { ops: QueuedOp[] }).ops;
        sent.push(...ops.map((o) => o.client_op_id));
        return ok(ops);
      },
    });
    await store.addOp(op("a", "job.start"));
    await store.addOp(op("b", "job.arrive"));
    await store.addOp(op("c", "job.complete"));
    const summary = await flush(deps);
    expect(sent).toEqual(["a", "b", "c"]);
    expect(summary).toMatchObject({ applied: 3, remainingOps: 0, offline: false, jobsRefreshed: true });
    expect((await store.loadJobs()).jobs[0].status).toBe("DONE");
  });

  it("never holds a job without the action that changed it, so a tap mid-send is judged on the truth", async () => {
    const seen: string[] = [];
    let release: (jobs: JobCard[]) => void = () => undefined;
    const { store, deps } = setup({
      post: async (_p, body) => ok((body as { ops: QueuedOp[] }).ops),
      // The refresh is slow: this is the moment a rider can tap again.
      fetchJobs: () => new Promise<JobCard[]>((resolve) => (release = resolve)),
    });
    await store.saveJobs([job()], "2026-10-07T04:00:00Z");
    await store.addOp(op("a", "job.start"));
    await store.addOp(op("b", "job.arrive"));
    const running = flush(deps);
    await new Promise((r) => setTimeout(r, 50));
    const [cache, queued] = await Promise.all([store.loadJobs(), store.loadOps()]);
    seen.push(effectiveJobs(cache.jobs, queued)[0].status);
    expect(queued).toEqual([]); // sent...
    release([job({ status: "ARRIVED" })]);
    await running;
    expect(seen).toEqual(["ARRIVED"]); // ...and still shown as arrived, so "complete" is allowed
    expect(nextStatus(seen[0] as JobCard["status"], "job.complete")).toBe("DONE");
  });

  it("loses nothing when the connection is down", async () => {
    const { store, deps } = setup({
      post: async () => {
        throw new TypeError("Network request failed");
      },
    });
    await store.addOp(op("a", "job.start"));
    const summary = await flush(deps);
    expect(summary).toMatchObject({ offline: true, remainingOps: 1, applied: 0 });
    expect(await store.loadOps()).toHaveLength(1);
  });

  it("loses nothing on a server error either", async () => {
    const { store, deps } = setup({
      post: async () => {
        throw apiError(503);
      },
    });
    await store.addOp(op("a", "job.start"));
    expect((await flush(deps)).remainingOps).toBe(1);
  });

  it("sends the same action id again after a lost reply, so the server applies it once", async () => {
    const seen: string[][] = [];
    let attempt = 0;
    const { store, deps } = setup({
      post: async (_p, body) => {
        const ops = (body as { ops: QueuedOp[] }).ops;
        seen.push(ops.map((o) => o.client_op_id));
        if (++attempt === 1) throw new TypeError("connection dropped after the server answered");
        return ok(ops);
      },
    });
    await store.addOp(op("a", "job.start"));
    await flush(deps);
    await flush(deps);
    expect(seen).toEqual([["a"], ["a"]]);
    expect(await store.loadOps()).toEqual([]);
  });

  it("surfaces what the server refused, with the order and the reason", async () => {
    const { store, deps } = setup({
      post: async (_p, body) => {
        const ops = (body as { ops: QueuedOp[] }).ops;
        return [
          ...ok([ops[0]]),
          ...ok([ops[1]], "CONFLICT", "ORD-0001 is already Failed — no further moves."),
        ];
      },
    });
    await store.saveJobs([job()], "2026-10-07T04:00:00Z");
    await store.addOp(op("a", "job.start"));
    await store.addOp(op("b", "job.complete"));
    const summary = await flush(deps);
    expect(summary.applied).toBe(1);
    expect(summary.issues).toHaveLength(1);
    const [found] = await store.loadIssues();
    expect(found).toMatchObject({
      order_ref: "ORD-0001",
      what: "Completing the job",
      message: "ORD-0001 is already Failed — no further moves.",
    });
    expect(await store.loadOps()).toEqual([]); // refused actions are not retried
  });

  it("leaves an action the server didn't answer for in the queue", async () => {
    const { store, deps } = setup({
      post: async (_p, body) => ok([(body as { ops: QueuedOp[] }).ops[0]]),
    });
    await store.addOp(op("a", "job.start"));
    await store.addOp(op("b", "job.arrive"));
    const summary = await flush(deps);
    expect(summary.remainingOps).toBe(1);
    expect((await store.loadOps())[0].client_op_id).toBe("b");
  });

  it("does not let one malformed action hold up the others", async () => {
    const { store, deps } = setup({
      post: async (_p, body) => {
        const ops = (body as { ops: QueuedOp[] }).ops;
        if (ops.length > 1 || ops[0].client_op_id === "bad") throw apiError(400, "Invalid job.");
        return ok(ops);
      },
    });
    await store.addOp(op("a", "job.start"));
    await store.addOp(op("bad", "job.fail"));
    await store.addOp(op("c", "job.arrive"));
    const summary = await flush(deps);
    expect(summary).toMatchObject({ applied: 2, remainingOps: 0 });
    expect(summary.issues).toHaveLength(1);
  });

  it("uploads photos after the actions and discards the file once it is safe", async () => {
    const order: string[] = [];
    const { store, deps, discarded } = setup({
      post: async (_p, body) => {
        order.push("ops");
        return ok((body as { ops: QueuedOp[] }).ops);
      },
      uploadProof: async () => {
        order.push("photo");
      },
    });
    await store.addOp(op("a", "job.start"));
    const proof: QueuedProof = { id: "p1", job_id: "job-1", uri: "file:///p1.jpg", captured_at: "" };
    await store.addProof(proof);
    const summary = await flush(deps);
    expect(order).toEqual(["ops", "photo"]);
    expect(summary).toMatchObject({ uploadedProofs: 1, remainingProofs: 0 });
    expect(discarded).toEqual(["file:///p1.jpg"]);
  });

  it("keeps a photo when the upload can't reach the server", async () => {
    const { store, deps, discarded } = setup({
      uploadProof: async () => {
        throw new TypeError("offline");
      },
    });
    await store.addProof({ id: "p1", job_id: "job-1", uri: "file:///p1.jpg", captured_at: "" });
    const summary = await flush(deps);
    expect(summary).toMatchObject({ offline: true, remainingProofs: 1 });
    expect(discarded).toEqual([]);
  });

  it("reports a photo the server will never take", async () => {
    const { store, deps, discarded } = setup({
      uploadProof: async () => {
        throw apiError(404, "No such job.");
      },
    });
    await store.addProof({ id: "p1", job_id: "job-1", uri: "file:///p1.jpg", captured_at: "" });
    const summary = await flush(deps);
    expect(summary.issues[0].what).toBe("Uploading a photo");
    expect(summary.remainingProofs).toBe(0);
    expect(discarded).toEqual(["file:///p1.jpg"]);
  });

  it("keeps the cached day when the refresh fails", async () => {
    const { store, deps } = setup({
      fetchJobs: async () => {
        throw new TypeError("offline");
      },
    });
    await store.saveJobs([job()], "2026-10-07T04:00:00Z");
    const summary = await flush(deps);
    expect(summary.offline).toBe(true);
    expect((await store.loadJobs()).jobs).toHaveLength(1);
  });
});

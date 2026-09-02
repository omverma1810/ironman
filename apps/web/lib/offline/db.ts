/**
 * The field rider's offline store (docs/08 batch 2.12, docs/02 §3.7
 * OfflineOp, R-304). IndexedDB rather than `localStorage`: it survives a
 * killed tab, isn't 5 MB-capped, and can hold the raw photo/signature
 * blobs a proof capture produces.
 *
 * Two stores, because the server has two different sync paths for them:
 * `ops` mirrors `POST /fulfilment/sync`'s batch JSON contract exactly
 * (`op_type`/`payload`/`client_ts`, keyed by the idempotency `client_op_id`
 * — see `fulfilment.services.apply_offline_op`); `proofs` holds pending
 * photo/signature/OTP captures, which only ever go through the standalone
 * multipart `POST /fulfilment/proofs` and have no offline-sync op_type of
 * their own.
 */
const DB_NAME = "ironman-field";
const DB_VERSION = 1;
const OPS_STORE = "ops";
const PROOFS_STORE = "proofs";

export type QueuedOpType = "job.start" | "job.arrive" | "job.complete" | "job.fail";

export type QueuedOp = {
  client_op_id: string;
  op_type: QueuedOpType;
  /** Always mirrored into `payload.job_id` too — that's the shape the
   * server's batch-sync endpoint expects. */
  job_id: string;
  payload: Record<string, unknown>;
  client_ts: string;
  queued_at: string;
};

export type QueuedProof = {
  id: string;
  job_id: string;
  kind: "PHOTO" | "OTP" | "SIGNATURE";
  file: Blob | null;
  otp_verified: boolean;
  geo_lat: number | null;
  geo_lng: number | null;
  queued_at: string;
};

function isSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OPS_STORE)) {
        db.createObjectStore(OPS_STORE, { keyPath: "client_op_id" });
      }
      if (!db.objectStoreNames.contains(PROOFS_STORE)) {
        db.createObjectStore(PROOFS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  if (!isSupported()) return [];
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function put(storeName: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function remove(storeName: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const key of keys) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const opsStore = {
  list: () => readAll<QueuedOp>(OPS_STORE),
  enqueue: (op: Omit<QueuedOp, "queued_at">) =>
    put(OPS_STORE, { ...op, queued_at: new Date().toISOString() } satisfies QueuedOp),
  remove: (clientOpIds: string[]) => remove(OPS_STORE, clientOpIds),
};

export const proofsStore = {
  list: () => readAll<QueuedProof>(PROOFS_STORE),
  enqueue: (proof: Omit<QueuedProof, "id" | "queued_at">) => {
    const record: QueuedProof = {
      ...proof,
      id: crypto.randomUUID(),
      queued_at: new Date().toISOString(),
    };
    return put(PROOFS_STORE, record).then(() => record);
  },
  remove: (ids: string[]) => remove(PROOFS_STORE, ids),
};

const DEVICE_ID_KEY = "ironman-field-device-id";

/** Stable per-browser id — not tied to login, since the offline queue can
 * outlive a single session. */
export function getDeviceId(): string {
  if (typeof localStorage === "undefined") return "unknown-device";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function newClientOpId(): string {
  return crypto.randomUUID();
}

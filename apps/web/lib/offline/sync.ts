"use client";

import { fulfilmentApi } from "@/lib/api/endpoints";
import type { OfflineOpResult } from "@/lib/api/types";
import { getDeviceId, opsStore, proofsStore } from "./db";

export type FlushResult = {
  appliedOps: number;
  conflicts: OfflineOpResult[];
  rejected: OfflineOpResult[];
  uploadedProofs: number;
  failedProofUploads: number;
};

/** Replays the whole queue: JSON ops batched through `/fulfilment/sync`
 * (idempotent — safe to call again after a partial success, docs/02 §3.7
 * R-304), then pending proof files one at a time through the standalone
 * multipart endpoint. Never throws — a still-offline flush just leaves the
 * queue as it was for the next attempt. */
export async function flushOfflineQueue(): Promise<FlushResult> {
  const result: FlushResult = {
    appliedOps: 0,
    conflicts: [],
    rejected: [],
    uploadedProofs: 0,
    failedProofUploads: 0,
  };

  const queuedOps = await opsStore.list();
  if (queuedOps.length > 0) {
    try {
      const results = await fulfilmentApi.offlineSync(
        getDeviceId(),
        queuedOps.map((op) => ({
          client_op_id: op.client_op_id,
          op_type: op.op_type,
          payload: op.payload,
          client_ts: op.client_ts,
        }))
      );
      const byId = new Map(results.map((r) => [r.client_op_id, r]));
      const toRemove: string[] = [];
      for (const op of queuedOps) {
        const r = byId.get(op.client_op_id);
        if (!r) continue;
        if (r.status === "APPLIED") {
          result.appliedOps += 1;
          toRemove.push(op.client_op_id);
        } else if (r.status === "CONFLICT") {
          result.conflicts.push(r);
          toRemove.push(op.client_op_id); // a stale action, not worth retrying
        } else if (r.status === "REJECTED") {
          result.rejected.push(r);
          toRemove.push(op.client_op_id);
        }
      }
      await opsStore.remove(toRemove);
    } catch {
      // still offline, or the server is unreachable — leave the queue intact
    }
  }

  const queuedProofs = await proofsStore.list();
  for (const proof of queuedProofs) {
    try {
      await fulfilmentApi.createProof({
        job: proof.job_id,
        kind: proof.kind,
        file: proof.file,
        otp_verified: proof.otp_verified,
        geo_lat: proof.geo_lat,
        geo_lng: proof.geo_lng,
      });
      await proofsStore.remove([proof.id]);
      result.uploadedProofs += 1;
    } catch {
      result.failedProofUploads += 1;
      // leave it queued — network still down, or a transient server error
    }
  }

  return result;
}

export async function pendingCount(): Promise<number> {
  const [ops, proofs] = await Promise.all([opsStore.list(), proofsStore.list()]);
  return ops.length + proofs.length;
}

/** Data rights in the app (docs/06 §5–6): a copy of your data, and deleting your account. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Platform, Share } from "react-native";
import { api } from "./api";

export type DeletionBlocker = { code: string; message: string };
export type DeletionCheck = { can_delete: boolean; blockers: DeletionBlocker[]; grace_days: number };
export type DeletionScheduled = { status: "PENDING" | "CANCELLED" | "COMPLETED"; requested_at: string; scheduled_for: string };

/** What, if anything, stands in the way of deleting: an order in progress, an unpaid invoice, an open issue. */
export function useDeletionCheck() {
  return useQuery({
    queryKey: ["deletion-check"],
    queryFn: () => api.get<DeletionCheck>("/me/deletion"),
    retry: false,
  });
}

/** A fresh code to the account's own phone: deletion is the one action that asks again. */
export function useSendDeletionCode() {
  return useMutation({
    mutationFn: (phone: string) => api.post("/auth/otp/request", { phone, purpose: "VERIFY" }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (input: { code: string; reason?: string }) =>
      api.delete<DeletionScheduled>("/me", { body: input }),
  });
}

export function useExportData() {
  return useMutation({ mutationFn: () => api.get<unknown>("/me/export") });
}

export function exportFileName(today = new Date()): string {
  return `ironman-my-data-${today.toISOString().slice(0, 10)}.json`;
}

/** Hands the customer their data: the share sheet on a phone (save to Files,
 * send to themselves), a download in a browser. */
export async function deliverExport(data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2);
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName();
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: exportFileName(), message: text });
}

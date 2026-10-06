import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  FeedbackInput,
  Me,
  OrderDetail,
  OrderListItem,
  Paginated,
  ReQuote,
  Tracking,
} from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/me") });
}

export function useMyOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<Paginated<OrderListItem>>("/orders/"),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => api.get<OrderDetail>(`/orders/${id}/`),
    enabled: !!id,
  });
}

// Re-quote approval (docs/08 batch 4.5 parity) — a variance beyond
// threshold at intake pauses the order until the customer approves or
// rejects the revised total.
export function usePendingRequotes() {
  return useQuery({
    queryKey: ["requotes", "pending"],
    queryFn: () => api.get<Paginated<ReQuote>>("/requotes/", { decision: "PENDING" }),
  });
}

export function useRespondToRequote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api.post<OrderDetail>(`/requotes/${id}/respond/`, { approved }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requotes", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// Feedback after delivery (docs/08 batch 4.6 parity).
export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FeedbackInput) => api.post("/growth/feedback/", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", variables.order] });
    },
  });
}

// ── Tracking, cancel, reschedule (docs/08 batch 8.2) ────────────────────

/** The customer-safe timeline for an order, by its tracking token. Refreshed
 * every 30 seconds while the screen is open: a rider on the way is news. */
export function useTracking(token: string | undefined) {
  return useQuery({
    queryKey: ["tracking", token],
    queryFn: () => api.get<Tracking>(`/track/${token}/`),
    enabled: !!token,
    refetchInterval: 30_000,
  });
}

function refreshOrder(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ["orders"] });
  queryClient.invalidateQueries({ queryKey: ["order", id] });
  queryClient.invalidateQueries({ queryKey: ["tracking"] });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<OrderDetail>(`/orders/${id}/cancel/`, { reason }),
    onSuccess: (_data, { id }) => refreshOrder(queryClient, id),
  });
}

export function useRescheduleOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, slotId }: { id: string; slotId: string }) =>
      api.post<OrderDetail>(`/orders/${id}/reschedule/`, { pickup_capacity: slotId }),
    onSuccess: (_data, { id }) => refreshOrder(queryClient, id),
  });
}

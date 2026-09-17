import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  FeedbackInput,
  Me,
  OrderDetail,
  OrderListItem,
  Paginated,
  ReQuote,
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

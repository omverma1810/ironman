import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Me, OrderDetail, OrderListItem, Paginated } from "./types";

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

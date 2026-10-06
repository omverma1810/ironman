import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Address,
  CreateOrderInput,
  GarmentType,
  OrderDetail,
  Paginated,
  PickupSlot,
  PublicApartment,
  Quote,
  Serviceability,
  Service,
} from "../types";
import type { OrderLineInput } from "../types";

export function useServiceability(pincode: string) {
  return useQuery({
    queryKey: ["serviceability", pincode],
    queryFn: () => api.get<Serviceability>("/territory/serviceability", { pincode }),
    enabled: /^\d{6}$/.test(pincode),
    retry: false,
    staleTime: 300_000,
  });
}

export function useApartmentSearch(q: string, cluster?: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["apartment-search", term, cluster],
    queryFn: () => api.get<PublicApartment[]>("/territory/apartments", { q: term, cluster }),
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
}

export function useSavedAddresses() {
  return useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.get<Paginated<Address>>("/customer-addresses/"),
  });
}

export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: async () =>
      (await api.get<Paginated<Service>>("/catalog/services/")).results.filter((s) => s.is_active),
    staleTime: 300_000,
  });
}

export function useGarmentTypes(service: string | null) {
  return useQuery({
    queryKey: ["garment-types", service],
    queryFn: async () =>
      (await api.get<Paginated<GarmentType>>("/catalog/garment-types/", { service, limit: 100 }))
        .results.filter((g) => g.is_active),
    enabled: !!service,
    staleTime: 300_000,
  });
}

/** The price for what's in the basket. Cached per basket, so stepping a count
 * back to an earlier value shows the earlier quote at once. */
export function useQuote(input: {
  hub: string | undefined;
  service: string | null;
  apartment?: string | null;
  isFirstOrder: boolean;
  lines: OrderLineInput[];
}) {
  const lines = JSON.stringify(input.lines);
  return useQuery({
    queryKey: ["quote", input.hub, input.service, input.apartment, input.isFirstOrder, lines],
    queryFn: () =>
      api.post<Quote>("/catalog/quote", {
        hub: input.hub,
        service: input.service,
        apartment: input.apartment ?? undefined,
        is_first_order: input.isFirstOrder,
        lines: input.lines,
      }),
    enabled: !!input.hub && !!input.service && input.lines.length > 0,
    placeholderData: (previous) => previous,
    retry: false,
  });
}

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Open pickup windows over the next two weeks for the customer's area. */
export function usePickupSlots(cluster: string | null | undefined) {
  const today = new Date();
  const from = isoDay(today);
  const to = isoDay(new Date(today.getTime() + 13 * 86_400_000));
  return useQuery({
    queryKey: ["pickup-slots", cluster, from],
    queryFn: () =>
      api.get<PickupSlot[]>("/territory/capacity", { cluster, kind: "PICKUP", from, to }),
    enabled: !!cluster,
    staleTime: 60_000,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateOrderInput; idempotencyKey: string }) =>
      api.post<OrderDetail>("/orders/", input, { idempotencyKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });
}

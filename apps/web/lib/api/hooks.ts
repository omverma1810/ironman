"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  authApi,
  catalogApi,
  customersApi,
  exceptionsApi,
  ordersApi,
  requotesApi,
  territoryApi,
  type OrderListParams,
} from "./endpoints";
import { ApiError } from "./errors";
import type { CreateOrderInput, OrderException } from "./types";

function errorToast(err: unknown, fallback = "Something went wrong.") {
  const message = ApiError.isApiError(err) ? err.message : fallback;
  toast.error(message, {
    description: ApiError.isApiError(err) && err.requestId ? `Ref: ${err.requestId}` : undefined,
  });
}

// ── Auth ───────────────────────────────────────────────────────────────
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      password,
      totp_code,
    }: {
      email: string;
      password: string;
      totp_code?: string;
    }) => authApi.login(email, password, totp_code),
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
    },
  });
}

// ── Territory ──────────────────────────────────────────────────────────
export function useHubs() {
  return useQuery({ queryKey: ["hubs"], queryFn: territoryApi.hubs, staleTime: 300_000 });
}

export function useClusters(hub?: string) {
  return useQuery({
    queryKey: ["clusters", hub],
    queryFn: () => territoryApi.clusters(hub),
    staleTime: 300_000,
  });
}

export function useApartments(params?: { cluster?: string; q?: string }) {
  return useQuery({
    queryKey: ["apartments", params],
    queryFn: () => territoryApi.apartments(params),
    staleTime: 120_000,
  });
}

// ── Catalog ────────────────────────────────────────────────────────────
export function useServices() {
  return useQuery({ queryKey: ["services"], queryFn: catalogApi.services, staleTime: 300_000 });
}

export function useGarmentTypes(service?: string) {
  return useQuery({
    queryKey: ["garment-types", service],
    queryFn: () => catalogApi.garmentTypes(service),
    enabled: !!service,
    staleTime: 300_000,
  });
}

// ── Customers ──────────────────────────────────────────────────────────
export function useCustomers(params?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: () => customersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: () => customersApi.get(id as string),
    enabled: !!id,
  });
}

// ── Orders ─────────────────────────────────────────────────────────────
export function useOrders(params?: OrderListParams) {
  return useQuery({
    queryKey: ["orders", params],
    queryFn: () => ordersApi.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.get(id as string),
    enabled: !!id,
    refetchInterval: 20_000,
  });
}

export function useOrderEvents(id: string | undefined) {
  return useQuery({
    queryKey: ["order-events", id],
    queryFn: () => ordersApi.events(id as string),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => ordersApi.create(input),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Order ${order.ref} created`);
    },
    onError: (err) => errorToast(err, "Couldn't create the order."),
  });
}

export function useCreateCounterOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateOrderInput, "channel">) => ordersApi.createCounter(input),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Order ${order.ref} created at the counter`);
    },
    onError: (err) => errorToast(err, "Couldn't create the order."),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => ordersApi.cancel(id, reason),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      toast.success(`${order.ref} cancelled`);
    },
    onError: (err) => errorToast(err, "Couldn't cancel the order."),
  });
}

export function useAdvanceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to_status }: { id: string; to_status: string }) =>
      ordersApi.advance(id, to_status),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      queryClient.invalidateQueries({ queryKey: ["order-events", order.id] });
      toast.success(`${order.ref} moved to ${order.status.replaceAll("_", " ").toLowerCase()}`);
    },
    onError: (err) => errorToast(err, "Couldn't update the order status."),
  });
}

export function useOrderIntake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      verified_lines,
      notes,
    }: {
      id: string;
      verified_lines: { garment_type: string; qty: number }[];
      notes?: string;
    }) => ordersApi.intake(id, verified_lines, notes),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      if (order.status === "ON_HOLD") {
        toast.warning(`${order.ref} needs a re-quote — counts differ from the estimate`);
      } else {
        toast.success(`Intake recorded for ${order.ref}`);
      }
    },
    onError: (err) => errorToast(err, "Couldn't record intake."),
  });
}

// ── Quote (not cached — always a fresh computation) ─────────────────────
export function useQuoteMutation() {
  return useMutation({
    mutationFn: catalogApi.quote,
    onError: (err) => errorToast(err, "Couldn't calculate a price for this order."),
  });
}

// ── Re-quotes ──────────────────────────────────────────────────────────
export function useRequotes(params?: { order?: string; decision?: string }) {
  return useQuery({
    queryKey: ["requotes", params],
    queryFn: () => requotesApi.list(params),
  });
}

export function useRespondToRequote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      requotesApi.respond(id, approved),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      queryClient.invalidateQueries({ queryKey: ["requotes"] });
      toast.success(order.status === "CANCELLED" ? "Re-quote rejected, order cancelled" : "Re-quote approved");
    },
    onError: (err) => errorToast(err, "Couldn't respond to the re-quote."),
  });
}

// ── Exceptions ─────────────────────────────────────────────────────────
export function useExceptions(params?: { status?: string; kind?: string; order?: string }) {
  return useQuery({
    queryKey: ["exceptions", params],
    queryFn: () => exceptionsApi.list(params),
  });
}

export function useCreateException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: exceptionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Exception raised");
    },
    onError: (err) => errorToast(err, "Couldn't raise the exception."),
  });
}

export function useUpdateException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<OrderException> }) =>
      exceptionsApi.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      toast.success("Exception updated");
    },
    onError: (err) => errorToast(err, "Couldn't update the exception."),
  });
}

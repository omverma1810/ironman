"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  authApi,
  catalogApi,
  custodyApi,
  customersApi,
  exceptionsApi,
  fulfilmentApi,
  identityApi,
  ordersApi,
  requotesApi,
  territoryApi,
  type GarmentLineListParams,
  type JobAssignEntry,
  type OrderListParams,
} from "./endpoints";
import { ApiError } from "./errors";
import type { CreateOrderInput, GarmentStage, OrderException } from "./types";

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

// ── Custody ────────────────────────────────────────────────────────────
export function useOrderBags(orderId: string | undefined) {
  return useQuery({
    queryKey: ["bags", orderId],
    queryFn: () => custodyApi.bagsForOrder(orderId as string),
    enabled: !!orderId,
  });
}

function invalidateBags(queryClient: ReturnType<typeof useQueryClient>, orderId: string) {
  queryClient.invalidateQueries({ queryKey: ["bags", orderId] });
}

export function useCreateBag(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderLineIds?: string[]) => custodyApi.createBag(orderId, orderLineIds),
    onSuccess: (bag) => {
      invalidateBags(queryClient, orderId);
      toast.success(`Bag ${bag.code} created — ${bag.garment_count} garments`);
    },
    onError: (err) => errorToast(err, "Couldn't create a bag for this order."),
  });
}

export function usePrintBagTag(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bagId: string) => custodyApi.printTag(bagId),
    onSuccess: (bag) => {
      invalidateBags(queryClient, orderId);
      toast.success(`Tag ready for ${bag.code}`);
    },
    onError: (err) => errorToast(err, "Couldn't print the bag tag."),
  });
}

export function useScanBag(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, to_stage }: { code: string; to_stage: GarmentStage }) =>
      custodyApi.scan(code, to_stage),
    onSuccess: (result) => {
      invalidateBags(queryClient, orderId);
      if (result.skipped_count > 0) {
        toast.warning(
          `${result.moved_count} garment${result.moved_count === 1 ? "" : "s"} moved, ` +
            `${result.skipped_count} couldn't (already diverged — check them individually)`
        );
      } else {
        toast.success(`${result.bag.code} moved to ${result.bag.current_stage.toLowerCase()}`);
      }
    },
    onError: (err) => errorToast(err, "Couldn't scan this bag."),
  });
}

export function useTransitionGarment(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to_stage }: { id: string; to_stage: GarmentStage }) =>
      custodyApi.transitionGarment(id, to_stage),
    onSuccess: () => invalidateBags(queryClient, orderId),
    onError: (err) => errorToast(err, "Couldn't update this garment."),
  });
}

export function useRecordQc(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, result, reason }: { id: string; result: "PASS" | "FAIL"; reason?: string }) =>
      custodyApi.recordQc(id, result, reason),
    onSuccess: (line) => {
      invalidateBags(queryClient, orderId);
      toast.success(
        line.stage === "PACKED" ? "Passed QC — packed" : "Failed QC — sent for rework"
      );
    },
    onError: (err) => errorToast(err, "Couldn't record the QC result."),
  });
}

// ── Production board (docs/08 batch 2.6) ────────────────────────────────
// Hub-wide, not order-scoped — separate query keys and invalidation from
// the order-detail Custody section's hooks above.
export function useGarmentLines(params?: GarmentLineListParams) {
  return useQuery({
    queryKey: ["garment-lines", params],
    queryFn: () => custodyApi.garmentLines(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useWipSummary(
  params?: Pick<GarmentLineListParams, "hub" | "due" | "exclude_terminal">
) {
  return useQuery({
    queryKey: ["wip-summary", params],
    queryFn: () => custodyApi.wipSummary(params),
    refetchInterval: 30_000,
  });
}

function invalidateBoard(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["garment-lines"] });
  queryClient.invalidateQueries({ queryKey: ["wip-summary"] });
}

export function useBoardScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, to_stage }: { code: string; to_stage: GarmentStage }) =>
      custodyApi.scan(code, to_stage),
    onSuccess: (result) => {
      invalidateBoard(queryClient);
      if (result.skipped_count > 0) {
        toast.warning(
          `${result.moved_count} garment${result.moved_count === 1 ? "" : "s"} moved, ` +
            `${result.skipped_count} couldn't (already diverged — check them individually)`
        );
      } else {
        toast.success(`${result.bag.code} moved to ${result.bag.current_stage.toLowerCase()}`);
      }
    },
    onError: (err) => errorToast(err, "Couldn't scan this bag."),
  });
}

export function useBoardRecordQc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, result, reason }: { id: string; result: "PASS" | "FAIL"; reason?: string }) =>
      custodyApi.recordQc(id, result, reason),
    onSuccess: (line) => {
      invalidateBoard(queryClient);
      toast.success(line.stage === "PACKED" ? "Passed QC — packed" : "Failed QC — sent for rework");
    },
    onError: (err) => errorToast(err, "Couldn't record the QC result."),
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

// ── Staff (docs/06 §3.1 "Manage users & roles") ─────────────────────────
export function useFieldStaff() {
  return useQuery({
    queryKey: ["staff", "FIELD"],
    queryFn: () => identityApi.staff("FIELD"),
  });
}

// ── Fulfilment (docs/02 §3.7) ───────────────────────────────────────────
export function useRouteDays(params?: { cluster?: string; date?: string }) {
  return useQuery({
    queryKey: ["route-days", params],
    queryFn: () => fulfilmentApi.routeDays(params),
    enabled: !!params?.cluster && !!params?.date,
  });
}

export function useRouteDay(id: string | undefined) {
  return useQuery({
    queryKey: ["route-day", id],
    queryFn: () => fulfilmentApi.routeDay(id as string),
    enabled: !!id,
  });
}

export function useCreateRouteDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cluster, date }: { cluster: string; date: string }) =>
      fulfilmentApi.createRouteDay(cluster, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-days"] });
      toast.success("Route day created");
    },
    onError: (err) => errorToast(err, "Couldn't create the route day."),
  });
}

export function useAssignRouteDay(routeDayId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ staff, jobs }: { staff: string[]; jobs: JobAssignEntry[] }) =>
      fulfilmentApi.assignRouteDay(routeDayId, staff, jobs),
    onSuccess: (routeDay) => {
      queryClient.invalidateQueries({ queryKey: ["route-day", routeDayId] });
      queryClient.invalidateQueries({ queryKey: ["route-days"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`${routeDay.jobs.length} job${routeDay.jobs.length === 1 ? "" : "s"} assigned`);
    },
    onError: (err) => errorToast(err, "Couldn't assign that job — check the order's status."),
  });
}

export function useJobAttempts(jobId: string | undefined) {
  return useQuery({
    queryKey: ["job-attempts", jobId],
    queryFn: () => fulfilmentApi.jobAttempts(jobId as string),
    enabled: !!jobId,
  });
}

export function useStartJob(routeDayId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => fulfilmentApi.startJob(jobId),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["route-day", routeDayId] });
      toast.success(`${job.order_ref} marked ${job.status.toLowerCase().replace("_", " ")}`);
    },
    onError: (err) => errorToast(err, "Couldn't start this job."),
  });
}

export function useFailJob(routeDayId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, reason_code }: { jobId: string; reason_code: string }) =>
      fulfilmentApi.failJob(jobId, reason_code),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["route-day", routeDayId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`${job.order_ref} marked failed`);
    },
    onError: (err) => errorToast(err, "Couldn't mark this job failed."),
  });
}

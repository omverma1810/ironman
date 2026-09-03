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
  suppliesApi,
  territoryApi,
  type ApartmentContactInput,
  type ApartmentInput,
  type ClusterInput,
  type ExceptionListParams,
  type GarmentLineListParams,
  type JobAssignEntry,
  type OrderListParams,
} from "./endpoints";
import { ApiError } from "./errors";
import type {
  ConsumptionRuleInput,
  CreateOrderInput,
  DeclaredLine,
  GarmentStage,
  Job,
  OrderException,
  ProofKind,
  StockAdjustmentInput,
  StockItemInput,
  StockReceiptInput,
} from "./types";
import { newClientOpId, opsStore, proofsStore, type QueuedOpType } from "@/lib/offline/db";
import { flushOfflineQueue, pendingCount } from "@/lib/offline/sync";

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

export function useCreateCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClusterInput) => territoryApi.createCluster(input),
    onSuccess: (cluster) => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      toast.success(`Cluster "${cluster.name}" created`);
    },
    onError: (err) => errorToast(err, "Couldn't create the cluster."),
  });
}

export function useUpdateCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ClusterInput> }) =>
      territoryApi.updateCluster(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      toast.success("Cluster updated");
    },
    onError: (err) => errorToast(err, "Couldn't update the cluster."),
  });
}

export function useApartments(params?: { cluster?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ["apartments", params],
    queryFn: () => territoryApi.apartments(params),
    staleTime: 120_000,
  });
}

export function useApartment(id: string | undefined) {
  return useQuery({
    queryKey: ["apartment", id],
    queryFn: () => territoryApi.apartment(id as string),
    enabled: !!id,
  });
}

export function useCreateApartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApartmentInput) => territoryApi.createApartment(input),
    onSuccess: (apartment) => {
      queryClient.invalidateQueries({ queryKey: ["apartments"] });
      toast.success(`${apartment.name} added`);
    },
    onError: (err) => errorToast(err, "Couldn't create the apartment."),
  });
}

export function useUpdateApartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ApartmentInput> }) =>
      territoryApi.updateApartment(id, patch),
    onSuccess: (apartment) => {
      queryClient.invalidateQueries({ queryKey: ["apartments"] });
      queryClient.invalidateQueries({ queryKey: ["apartment", apartment.id] });
      toast.success(`${apartment.name} updated`);
    },
    onError: (err) => errorToast(err, "Couldn't update the apartment."),
  });
}

function invalidateApartmentContacts(
  queryClient: ReturnType<typeof useQueryClient>,
  apartmentId: string
) {
  queryClient.invalidateQueries({ queryKey: ["apartments"] });
  queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] });
}

export function useCreateApartmentContact(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApartmentContactInput) => territoryApi.createApartmentContact(input),
    onSuccess: () => {
      invalidateApartmentContacts(queryClient, apartmentId);
      toast.success("Contact added");
    },
    onError: (err) => errorToast(err, "Couldn't add the contact."),
  });
}

export function useUpdateApartmentContact(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ApartmentContactInput> }) =>
      territoryApi.updateApartmentContact(id, patch),
    onSuccess: () => {
      invalidateApartmentContacts(queryClient, apartmentId);
      toast.success("Contact updated");
    },
    onError: (err) => errorToast(err, "Couldn't update the contact."),
  });
}

export function useDeleteApartmentContact(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => territoryApi.deleteApartmentContact(id),
    onSuccess: () => {
      invalidateApartmentContacts(queryClient, apartmentId);
      toast.success("Contact removed");
    },
    onError: (err) => errorToast(err, "Couldn't remove the contact."),
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
export function useExceptions(params?: ExceptionListParams) {
  return useQuery({
    queryKey: ["exceptions", params],
    queryFn: () => exceptionsApi.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
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

// The unfiltered staff picker is Admin/Founder-only server-side
// (identity.views.StaffListView) — enabled controls this at the call
// site so an Operator's exceptions-queue assignee dropdown doesn't fire
// a request it knows will 403.
export function useOpsStaff(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "ops"],
    queryFn: () => identityApi.staff(),
    enabled,
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

// ── Field PWA (docs/08 batch 2.11/2.12) ─────────────────────────────────
// Every mutation below is offline-aware: a real network failure (not a
// domain rejection — an `ApiError` always means the server was reached and
// said no) queues the same action in IndexedDB instead of failing, and the
// UI applies the same optimistic status change either way. `flushOfflineQueue`
// replays the queue once connectivity is back.

function patchJobCaches(queryClient: ReturnType<typeof useQueryClient>, jobId: string, patch: Partial<Job>) {
  queryClient.setQueryData<Job>(["job", jobId], (job) => (job ? { ...job, ...patch } : job));
  queryClient.setQueriesData<Job[]>({ queryKey: ["my-jobs"] }, (jobs) =>
    jobs?.map((j) => (j.id === jobId ? { ...j, ...patch } : j))
  );
}

async function runOfflineAwareAction<T>(opts: {
  jobId: string;
  opType: QueuedOpType;
  payload: Record<string, unknown>;
  online: () => Promise<T>;
}): Promise<{ job: T | null; queued: boolean }> {
  try {
    return { job: await opts.online(), queued: false };
  } catch (err) {
    if (ApiError.isApiError(err)) throw err; // a real rejection — never queue those
    await opsStore.enqueue({
      client_op_id: newClientOpId(),
      op_type: opts.opType,
      job_id: opts.jobId,
      payload: { job_id: opts.jobId, ...opts.payload },
      client_ts: new Date().toISOString(),
    });
    return { job: null, queued: true };
  }
}

export function useMyJobs(date?: string) {
  return useQuery({
    queryKey: ["my-jobs", date],
    queryFn: () => fulfilmentApi.myJobs(date),
    refetchInterval: 60_000,
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ["job", id],
    queryFn: () => fulfilmentApi.job(id as string),
    enabled: !!id,
  });
}

export function usePendingSyncCount() {
  return useQuery({
    queryKey: ["offline-pending-count"],
    queryFn: pendingCount,
    refetchInterval: 5_000,
  });
}

function useOfflineAwareStatusMutation(opType: QueuedOpType, statusPatch: (jobId: string) => Partial<Job>) {
  const queryClient = useQueryClient();
  return useMutation({
    // TanStack Query's default `networkMode: "online"` pauses a mutation
    // — never even calling `mutationFn` — for as long as it thinks the
    // browser is offline, which would make the offline/online branch
    // inside `runOfflineAwareAction` dead code. `"always"` runs it
    // unconditionally so our own try/catch is what decides that, exactly
    // once, immediately.
    networkMode: "always",
    mutationFn: async ({
      jobId,
      payload = {},
      online,
    }: {
      jobId: string;
      payload?: Record<string, unknown>;
      online: () => Promise<Job>;
    }) => runOfflineAwareAction({ jobId, opType, payload, online }),
    onSuccess: ({ job, queued }, { jobId }) => {
      patchJobCaches(queryClient, jobId, job ?? statusPatch(jobId));
      queryClient.invalidateQueries({ queryKey: ["offline-pending-count"] });
      if (queued) toast.info("No signal — saved on this phone, will sync automatically.");
    },
  });
}

export function useStartJobField() {
  const mutation = useOfflineAwareStatusMutation("job.start", () => ({
    status: "EN_ROUTE",
    started_at: new Date().toISOString(),
  }));
  return {
    ...mutation,
    mutate: (jobId: string) =>
      mutation.mutate(
        { jobId, online: () => fulfilmentApi.startJob(jobId) },
        { onError: (err) => errorToast(err, "Couldn't start this job.") }
      ),
  };
}

export function useArriveJobField() {
  const mutation = useOfflineAwareStatusMutation("job.arrive", () => ({
    status: "ARRIVED",
    arrived_at: new Date().toISOString(),
  }));
  return {
    ...mutation,
    mutate: (jobId: string) =>
      mutation.mutate(
        { jobId, online: () => fulfilmentApi.arriveJob(jobId) },
        { onError: (err) => errorToast(err, "Couldn't mark this job arrived.") }
      ),
  };
}

export type CompleteJobFieldInput = {
  jobId: string;
  declared_lines?: DeclaredLine[];
  bag_codes?: string[];
  otp_verified?: boolean;
};

export function useCompleteJobField() {
  const mutation = useOfflineAwareStatusMutation("job.complete", () => ({
    status: "DONE",
    completed_at: new Date().toISOString(),
  }));
  return {
    ...mutation,
    mutate: (input: CompleteJobFieldInput) => {
      const proof = input.otp_verified ? { kind: "OTP" as ProofKind, otp_verified: true } : null;
      const payload = {
        declared_lines: input.declared_lines ?? [],
        bag_codes: input.bag_codes ?? [],
        proof,
      };
      mutation.mutate(
        {
          jobId: input.jobId,
          payload,
          online: () => fulfilmentApi.completeJob(input.jobId, payload),
        },
        { onError: (err) => errorToast(err, "Couldn't complete this job.") }
      );
    },
  };
}

export function useFailJobField() {
  const mutation = useOfflineAwareStatusMutation("job.fail", () => ({ status: "FAILED" }));
  return {
    ...mutation,
    mutate: (input: { jobId: string; reason_code: string; note?: string }) => {
      const payload = { reason_code: input.reason_code, note: input.note ?? "" };
      mutation.mutate(
        {
          jobId: input.jobId,
          payload,
          online: () => fulfilmentApi.failJob(input.jobId, input.reason_code, input.note),
        },
        { onError: (err) => errorToast(err, "Couldn't mark this job failed.") }
      );
    },
  };
}

/** Photo/signature/OTP capture — a standalone call outside the JSON
 * offline-sync contract (`fulfilment.services._OP_HANDLERS` has no
 * "proof.create" op), so it gets its own blob-capable queue
 * (`lib/offline/db`'s `proofs` store) instead of the ops one above. */
export function useCreateProofField() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always", // see useOfflineAwareStatusMutation's comment
    mutationFn: async (input: {
      jobId: string;
      kind: ProofKind;
      file?: File | null;
      otp_verified?: boolean;
      geo_lat?: number | null;
      geo_lng?: number | null;
    }) => {
      try {
        return {
          proof: await fulfilmentApi.createProof({
            job: input.jobId,
            kind: input.kind,
            file: input.file,
            otp_verified: input.otp_verified,
            geo_lat: input.geo_lat,
            geo_lng: input.geo_lng,
          }),
          queued: false,
        };
      } catch (err) {
        if (ApiError.isApiError(err)) throw err;
        await proofsStore.enqueue({
          job_id: input.jobId,
          kind: input.kind,
          file: input.file ?? null,
          otp_verified: input.otp_verified ?? false,
          geo_lat: input.geo_lat ?? null,
          geo_lng: input.geo_lng ?? null,
        });
        return { proof: null, queued: true };
      }
    },
    onSuccess: ({ queued }, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["job-proofs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["offline-pending-count"] });
      toast.success(queued ? "Saved — will upload once you're back online." : "Proof captured.");
    },
    onError: (err) => errorToast(err, "Couldn't save this proof."),
  });
}

export function useJobProofs(jobId: string | undefined) {
  return useQuery({
    queryKey: ["job-proofs", jobId],
    queryFn: () => fulfilmentApi.jobProofs(jobId as string),
    enabled: !!jobId,
  });
}

export function useSyncOfflineQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: flushOfflineQueue,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["offline-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job"] });
      const synced = result.appliedOps + result.uploadedProofs;
      if (result.conflicts.length > 0 || result.rejected.length > 0) {
        toast.warning(
          `Synced ${synced} — ${result.conflicts.length + result.rejected.length} couldn't apply (check those jobs).`
        );
      } else if (synced > 0) {
        toast.success(`Synced ${synced} queued action${synced === 1 ? "" : "s"}.`);
      }
    },
  });
}

// ── Supplies (docs/08 batch 2.13) ────────────────────────────────────────
export function useStockItems(params?: { hub?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: ["stock-items", params],
    queryFn: () => suppliesApi.items(params),
    staleTime: 60_000,
  });
}

export function useCreateStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StockItemInput) => suppliesApi.createItem(input),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast.success(`${item.name} added`);
    },
    onError: (err) => errorToast(err, "Couldn't create the stock item."),
  });
}

export function useUpdateStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<StockItemInput> }) =>
      suppliesApi.updateItem(id, patch),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast.success(`${item.name} updated`);
    },
    onError: (err) => errorToast(err, "Couldn't update the stock item."),
  });
}

export function useStockLevels(hub?: string) {
  return useQuery({
    queryKey: ["stock-levels", hub],
    queryFn: () => suppliesApi.levels(hub),
    staleTime: 30_000,
  });
}

export function useReorderAlerts() {
  return useQuery({
    queryKey: ["reorder-alerts"],
    queryFn: suppliesApi.reorderAlerts,
    staleTime: 30_000,
  });
}

export function useStockMovements(params?: { item?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["stock-movements", params],
    queryFn: () => suppliesApi.movements(params),
    enabled: !!params?.item,
  });
}

function invalidateStock(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
  queryClient.invalidateQueries({ queryKey: ["reorder-alerts"] });
  queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
}

export function useReceiveStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StockReceiptInput) => suppliesApi.receiveStock(input),
    onSuccess: (movement) => {
      invalidateStock(queryClient);
      toast.success(`Received ${movement.delta_qty} ${movement.sku}`);
    },
    onError: (err) => errorToast(err, "Couldn't record the receipt."),
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StockAdjustmentInput) => suppliesApi.adjustStock(input),
    onSuccess: (movement) => {
      invalidateStock(queryClient);
      toast.success(`${movement.sku} adjusted by ${movement.delta_qty}`);
    },
    onError: (err) => errorToast(err, "Couldn't record the adjustment."),
  });
}

export function useConsumptionRules() {
  return useQuery({
    queryKey: ["consumption-rules"],
    queryFn: suppliesApi.consumptionRules,
    staleTime: 60_000,
  });
}

export function useReplaceConsumptionRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rules: ConsumptionRuleInput[]) => suppliesApi.replaceConsumptionRules(rules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumption-rules"] });
      toast.success("Consumption rules saved");
    },
    onError: (err) => errorToast(err, "Couldn't save the consumption rules."),
  });
}

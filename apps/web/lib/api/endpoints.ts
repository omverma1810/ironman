import { apiFetch, newIdempotencyKey } from "./client";
import type {
  Apartment,
  BagDetail,
  Cluster,
  CreateOrderInput,
  Customer,
  CustomerDetail,
  GarmentLine,
  GarmentStage,
  GarmentType,
  Hub,
  Me,
  OrderDetail,
  OrderEvent,
  OrderException,
  OrderListItem,
  Paginated,
  Quote,
  ReQuote,
  RouteDayCapacity,
  ScanResult,
  Service,
  StageEvent,
} from "./types";

// ── Auth / identity ────────────────────────────────────────────────────
export const authApi = {
  me: () => apiFetch<Me>("/me"),
  login: (email: string, password: string, totp_code?: string) =>
    apiFetch<{ user: Me }>("/auth/login", {
      method: "POST",
      body: { email, password, totp_code },
    }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  otpRequest: (phone: string, purpose: "LOGIN" | "VERIFY" = "LOGIN") =>
    apiFetch<{ challenge_id: string; expires_in: number }>("/auth/otp/request", {
      method: "POST",
      body: { phone, purpose },
    }),
  otpVerify: (phone: string, code: string, full_name?: string) =>
    apiFetch<{ access: string; refresh: string; user: Me; created: boolean }>(
      "/auth/otp/verify",
      { method: "POST", body: { phone, code, full_name } }
    ),
  mfaEnroll: () =>
    apiFetch<{ secret: string; otpauth_uri: string }>("/auth/mfa/enroll", { method: "POST" }),
  mfaVerify: (code: string) =>
    apiFetch<{ enabled: boolean }>("/auth/mfa/verify", { method: "POST", body: { code } }),
  passwordResetRequest: (email: string) =>
    apiFetch<{ sent: boolean }>("/auth/password/reset/request", {
      method: "POST",
      body: { email },
    }),
  passwordResetConfirm: (token: string, new_password: string) =>
    apiFetch<{ reset: boolean }>("/auth/password/reset/confirm", {
      method: "POST",
      body: { token, new_password },
    }),
};

// ── Territory ──────────────────────────────────────────────────────────
export const territoryApi = {
  hubs: () => apiFetch<Paginated<Hub>>("/territory/hubs/"),
  clusters: (hub?: string) =>
    apiFetch<Paginated<Cluster>>("/territory/clusters/", { params: { hub } }),
  apartments: (params?: { cluster?: string; q?: string }) =>
    apiFetch<Paginated<Apartment>>("/territory/apartments-admin/", { params }),
  apartment: (id: string) => apiFetch<Apartment>(`/territory/apartments-admin/${id}/`),
  capacity: (params: { cluster: string; kind: "PICKUP" | "DELIVERY"; from: string; to: string }) =>
    apiFetch<RouteDayCapacity[]>("/territory/capacity", { params }),
  serviceability: (pincode: string) =>
    apiFetch<{ serviceable: boolean; hub: { id: string; code: string; name: string } | null }>(
      "/territory/serviceability",
      { params: { pincode } }
    ),
};

// ── Catalog ────────────────────────────────────────────────────────────
export const catalogApi = {
  services: () => apiFetch<Paginated<Service>>("/catalog/services/"),
  garmentTypes: (service?: string) =>
    apiFetch<Paginated<GarmentType>>("/catalog/garment-types/", { params: { service } }),
  quote: (input: {
    hub: string;
    service: string;
    apartment?: string;
    is_first_order?: boolean;
    lines: { garment_type: string; qty: number }[];
  }) => apiFetch<Quote>("/catalog/quote", { method: "POST", body: input }),
};

// ── Customers ──────────────────────────────────────────────────────────
export const customersApi = {
  list: (params?: { status?: string; search?: string; cursor?: string }) =>
    apiFetch<Paginated<Customer>>("/customers/", { params }),
  get: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}/`),
  create: (input: Partial<CustomerDetail> & { name: string; phone: string; hub: string }) =>
    apiFetch<CustomerDetail>("/customers/", { method: "POST", body: input }),
  duplicates: (id: string) => apiFetch<Customer[]>(`/customers/${id}/duplicates/`),
};

// ── Ordering ───────────────────────────────────────────────────────────
export type OrderListParams = {
  status?: string;
  channel?: string;
  apartment?: string;
  hub?: string;
  search?: string;
  cursor?: string;
};

export const ordersApi = {
  list: (params?: OrderListParams) =>
    apiFetch<Paginated<OrderListItem>>("/orders/", { params }),
  get: (id: string) => apiFetch<OrderDetail>(`/orders/${id}/`),
  events: (id: string) => apiFetch<OrderEvent[]>(`/orders/${id}/events/`),
  create: (input: CreateOrderInput) =>
    apiFetch<OrderDetail>("/orders/", {
      method: "POST",
      body: input,
      idempotencyKey: newIdempotencyKey(),
    }),
  createCounter: (input: Omit<CreateOrderInput, "channel">) =>
    apiFetch<OrderDetail>("/orders/counter", {
      method: "POST",
      body: input,
      idempotencyKey: newIdempotencyKey(),
    }),
  cancel: (id: string, reason: string) =>
    apiFetch<OrderDetail>(`/orders/${id}/cancel/`, { method: "POST", body: { reason } }),
  reschedule: (id: string, pickup_capacity: string) =>
    apiFetch<OrderDetail>(`/orders/${id}/reschedule/`, {
      method: "POST",
      body: { pickup_capacity },
    }),
  advance: (id: string, to_status: string) =>
    apiFetch<OrderDetail>(`/orders/${id}/advance/`, { method: "POST", body: { to_status } }),
  intake: (id: string, verified_lines: { garment_type: string; qty: number }[], notes?: string) =>
    apiFetch<OrderDetail>(`/orders/${id}/intake/`, {
      method: "POST",
      body: { verified_lines, notes },
    }),
};

export const requotesApi = {
  list: (params?: { order?: string; decision?: string }) =>
    apiFetch<Paginated<ReQuote>>("/requotes/", { params }),
  respond: (id: string, approved: boolean) =>
    apiFetch<OrderDetail>(`/requotes/${id}/respond/`, { method: "POST", body: { approved } }),
};

export const exceptionsApi = {
  list: (params?: { status?: string; kind?: string; order?: string }) =>
    apiFetch<Paginated<OrderException>>("/order-exceptions/", { params }),
  create: (input: {
    order: string;
    kind: OrderException["kind"];
    severity: OrderException["severity"];
    description: string;
  }) => apiFetch<OrderException>("/order-exceptions/", { method: "POST", body: input }),
  update: (id: string, patch: Partial<OrderException>) =>
    apiFetch<OrderException>(`/order-exceptions/${id}/`, { method: "PATCH", body: patch }),
};

// ── Custody ────────────────────────────────────────────────────────────
export const custodyApi = {
  bagsForOrder: (orderId: string) =>
    apiFetch<Paginated<BagDetail>>("/custody/bags/", { params: { order: orderId } }),
  createBag: (orderId: string, orderLineIds?: string[]) =>
    apiFetch<BagDetail>(`/orders/${orderId}/bags`, {
      method: "POST",
      body: orderLineIds ? { order_line_ids: orderLineIds } : {},
      idempotencyKey: newIdempotencyKey(),
    }),
  printTag: (bagId: string) =>
    apiFetch<BagDetail>(`/custody/bags/${bagId}/print_tag/`, { method: "POST" }),
  stageEvents: (bagId: string) =>
    apiFetch<StageEvent[]>(`/custody/bags/${bagId}/stage_events/`),
  scan: (code: string, to_stage: GarmentStage) =>
    apiFetch<ScanResult>("/custody/scan", { method: "POST", body: { code, to_stage } }),
  transitionGarment: (garmentLineId: string, to_stage: GarmentStage) =>
    apiFetch<GarmentLine>(`/custody/garment-lines/${garmentLineId}/transition/`, {
      method: "POST",
      body: { to_stage },
    }),
  recordQc: (garmentLineId: string, result: "PASS" | "FAIL", reason?: string) =>
    apiFetch<GarmentLine>(`/custody/garment-lines/${garmentLineId}/qc/`, {
      method: "POST",
      body: { result, reason },
    }),
};

// ── Platform ───────────────────────────────────────────────────────────
export const platformApi = {
  config: () =>
    apiFetch<{ roles: { code: string; label: string }[]; currency: string }>(
      "/platform/config"
    ),
};

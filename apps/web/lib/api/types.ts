/** Mirrors the DRF serializers in apps/api (docs/04). Kept hand-written and
 * in sync for now; a generated client (from schema/openapi.yaml) is the
 * Phase-2+ upgrade path noted in docs/03 §8 CI. */
import type { Money } from "@/lib/format";

export type Role = "CUSTOMER" | "FIELD" | "OPERATOR" | "ADMIN" | "FOUNDER" | "VIEWER";

export type Me = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  preferred_language: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  mfa_enabled: boolean;
  roles: Role[];
  hub_scope: string[] | "all";
  requires_mfa: boolean;
};

export type Staff = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
};

export type Paginated<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

export type Hub = {
  id: string;
  code: string;
  name: string;
  address: string;
  timezone: string;
  cutoff_time: string;
  daily_pressing_capacity: number;
  is_active: boolean;
};

export type Cluster = {
  id: string;
  hub: string;
  hub_code: string;
  name: string;
  notes: string;
  is_active: boolean;
};

export type ApartmentContact = {
  id: string;
  kind: "WATCHMAN" | "MANAGER" | "RWA";
  name: string;
  phone: string;
  notes: string;
};

export type Apartment = {
  id: string;
  cluster: string;
  cluster_name: string;
  name: string;
  address: string;
  pincode: string;
  gate_notes: string;
  is_active: boolean;
  launched_on: string | null;
  contacts: ApartmentContact[];
};

export type RouteDayCapacity = {
  id: string;
  hub: string;
  cluster: string;
  date: string;
  window_start: string;
  window_end: string;
  kind: "PICKUP" | "DELIVERY";
  capacity: number;
  booked_count: number;
  available: number;
};

export type Service = {
  id: string;
  code: string;
  name: string;
  unit: "PER_ITEM" | "PER_KG" | "PER_PAIR";
  sla_hours: number;
  is_active: boolean;
};

export type GarmentType = {
  id: string;
  service: string;
  code: string;
  name: string;
  default_press_seconds: number;
  is_active: boolean;
};

export type QuoteLine = {
  garment_type: string;
  garment_type_name: string;
  qty: number;
  unit_price: Money;
  line_total: Money;
};

export type Quote = {
  price_list_id: string;
  price_list_version: number;
  lines: QuoteLine[];
  subtotal: Money;
  discount: Money;
  total: Money;
  offers_applied: string[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  status: "LEAD" | "ACTIVE" | "LAPSED" | "BLOCKED";
  first_order_at: string | null;
  last_order_at: string | null;
  lifetime_orders: number;
  lifetime_gross_minor: number;
  acquisition_channel: string;
};

export type CustomerDetail = Customer & {
  email: string;
  preferred_language: string;
  acquisition_apartment: string | null;
  addresses: Address[];
  notes: CustomerNote[];
  created_at: string;
};

export type Address = {
  id: string;
  apartment: string | null;
  apartment_name: string;
  flat_no: string;
  block: string;
  landmark: string;
  free_text_address: string;
  label: string;
  is_default: boolean;
};

export type CustomerNote = {
  id: string;
  body: string;
  is_internal: boolean;
  author: string | null;
  author_name: string;
  created_at: string;
};

export type OrderStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  | "SCHEDULED"
  | "PICKUP_ASSIGNED"
  | "PICKUP_EN_ROUTE"
  | "PICKUP_FAILED"
  | "PICKED_UP"
  | "AT_HUB"
  | "INTAKE_VERIFIED"
  | "IN_PRODUCTION"
  | "READY"
  | "DELIVERY_ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERY_FAILED"
  | "RETURNED_TO_HUB"
  | "DELIVERED"
  | "ON_HOLD"
  | "CANCELLED"
  | "CLOSED";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "WRITTEN_OFF";
export type Channel = "WEB" | "WHATSAPP" | "COUNTER" | "PHONE" | "APP";

export type OrderLine = {
  id: string;
  garment_type: string;
  garment_type_name: string;
  declared_qty: number;
  verified_qty: number | null;
  unit_price_minor: number;
  line_total_minor: number;
  notes: string;
};

export type OrderListItem = {
  id: string;
  ref: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  channel: Channel;
  customer: string;
  customer_name: string;
  customer_phone: string;
  apartment: string | null;
  apartment_name: string;
  service: string;
  service_name: string;
  pickup_slot_start: string | null;
  pickup_slot_end: string | null;
  delivery_slot_start: string | null;
  delivery_slot_end: string | null;
  declared_total_qty: number;
  verified_total_qty: number | null;
  total_minor: number;
  created_at: string;
  is_late_pickup: boolean;
};

export type OrderDetail = OrderListItem & {
  hub: string;
  address: string | null;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  offers_applied: string[];
  notes: string;
  special_instructions: string;
  referral_code: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  pickup_promised_at: string | null;
  delivery_promised_at: string | null;
  cancelled_reason: string;
  cancelled_at: string | null;
  lines: OrderLine[];
};

export type OrderEvent = {
  id: string;
  event_type: string;
  from_status: string;
  to_status: string;
  actor: string | null;
  actor_name: string;
  actor_role: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type ReQuote = {
  id: string;
  order: string;
  order_ref: string;
  reason: string;
  old_total_minor: number;
  new_total_minor: number;
  decision: "PENDING" | "APPROVED" | "REJECTED";
  sent_at: string;
  decided_at: string | null;
};

export type OrderException = {
  id: string;
  order: string;
  order_ref: string;
  kind: "DAMAGED" | "LOST" | "MISSING" | "WRONG_ITEM" | "REPRESS" | "COMPLAINT";
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  raised_by: string | null;
  assigned_to: string | null;
  sla_due_at: string | null;
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "WRITTEN_OFF";
  resolution: string;
  cost_minor: number;
  resolved_at: string | null;
  created_at: string;
};

// ── Custody (docs/02 §3.6, docs/01 §5.3) ────────────────────────────────
export type GarmentStage =
  | "RECEIVED"
  | "SORTED"
  | "PRESSING"
  | "PRESSED"
  | "QC"
  | "REWORK"
  | "PACKED"
  | "DISPATCHED"
  | "DELIVERED"
  | "DAMAGED"
  | "LOST"
  | "HELD"
  | "RETURNED_UNPRESSED";

export type GarmentLine = {
  id: string;
  order_line: string;
  bag: string;
  bag_code: string;
  seq: number;
  garment_type: string;
  garment_type_name: string;
  stage: GarmentStage;
  condition_notes: string;
  defect_flags: string[];
  is_rework: boolean;
  rework_count: number;
  created_at: string;
};

export type Bag = {
  id: string;
  code: string;
  order: string;
  order_ref: string;
  hub: string;
  garment_count: number;
  garment_line_count: number;
  current_stage: GarmentStage;
  printed_at: string | null;
  created_at: string;
};

export type BagDetail = Bag & { garment_lines: GarmentLine[] };

export type StageEvent = {
  id: string;
  bag: string | null;
  garment_line: string | null;
  from_stage: string;
  to_stage: string;
  actor: string | null;
  actor_name: string;
  station: string;
  scanned: boolean;
  occurred_at: string;
  device_id: string;
};

export type ScanResult = {
  bag: BagDetail;
  moved_count: number;
  skipped_count: number;
  skipped: GarmentLine[];
};

// ── Fulfilment (docs/02 §3.7) ───────────────────────────────────────────
export type JobKind = "PICKUP" | "DELIVERY";
export type JobStatus = "PENDING" | "EN_ROUTE" | "ARRIVED" | "DONE" | "FAILED";
export type RouteDayStatus = "PLANNED" | "ACTIVE" | "CLOSED";

export type Job = {
  id: string;
  route_day: string;
  order: string;
  order_ref: string;
  kind: JobKind;
  sequence: number;
  assigned_to: string | null;
  assigned_to_name: string;
  status: JobStatus;
  slot_start: string | null;
  slot_end: string | null;
  started_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  attempt_no: number;
};

export type RouteDay = {
  id: string;
  hub: string;
  cluster: string;
  cluster_name: string;
  date: string;
  status: RouteDayStatus;
  job_count: number;
  created_at: string;
};

export type RouteDayDetail = RouteDay & { jobs: Job[]; staff: string[] };

export type JobAttempt = {
  id: string;
  job: string;
  attempt_no: number;
  outcome: "DONE" | "FAILED";
  failure_reason: string;
  notes: string;
  at: string;
};

export type OrderLineInput = { garment_type: string; qty: number };

export type CreateOrderInput = {
  hub: string;
  customer: string;
  service: string;
  address?: string;
  apartment?: string;
  channel: Channel;
  pickup_capacity?: string;
  lines: OrderLineInput[];
  notes?: string;
  special_instructions?: string;
  referral_code?: string;
};
